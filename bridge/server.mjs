import http from "node:http";
import { spawn } from "node:child_process";
import readline from "node:readline";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { playWindowsAlert } from "../scripts/native-alert.mjs";
import { sendWindowsNotification } from "../scripts/native-notification.mjs";
import { getNotifierDirectory, publicNotifierSettings, readNotifierSettings, writeNotifierSettings } from "../scripts/notifier-settings.mjs";

export const PORT = Number(process.env.CODEX_NOTIFIER_PORT || 43123);

const clients = new Set();
const tasks = new Map();
let codexProcess = null;

function safeJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function taskTitle(payload = {}) {
  if (payload.name || payload.title) return payload.name || payload.title;
  if (payload.last_assistant_message) return String(payload.last_assistant_message).slice(0, 74);
  const cwd = payload.cwd || payload.workspace || "Codex";
  return `Codex · ${String(cwd).split(/[\\/]/).filter(Boolean).pop() || "任务"}`;
}

function taskIdFrom(payload = {}, fallback = "codex-live") {
  return String(payload.taskId || payload.threadId || payload.thread_id || payload.sessionId || payload.session_id || payload.turnId || payload.turn_id || fallback);
}

function formatDuration(startedAt) {
  if (!startedAt) return "--:--:--";
  const total = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const hours = String(Math.floor(total / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const response of clients) {
    try { response.write(data); } catch { clients.delete(response); }
  }
}

function upsertTask(event) {
  const id = taskIdFrom(event);
  const current = tasks.get(id);
  const startedAt = current?.startedAt || (event.state === "running" ? Date.now() : undefined);
  const task = {
    id,
    taskId: id,
    threadId: event.threadId || current?.threadId,
    sessionId: event.sessionId || current?.sessionId,
    turnId: event.turnId || current?.turnId,
    name: event.name || current?.name || taskTitle(event),
    state: event.state,
    progress: event.progress ?? current?.progress ?? (event.state === "completed" ? 100 : 0),
    time: formatDuration(startedAt),
    startedAt,
    source: event.source || "codex",
    updatedAt: Date.now(),
  };
  tasks.set(id, task);
  const publicTask = { ...task };
  broadcast({ ...publicTask, type: event.type || "TASK_RUNNING" });
  return publicTask;
}

export function hookToEvent(eventName, payload) {
  const id = taskIdFrom(payload);
  const map = {
    SessionStart: "TASK_STARTED",
    UserPromptSubmit: "TASK_RUNNING",
    PreToolUse: "TASK_RUNNING",
    PostToolUse: "TASK_RUNNING",
    SubagentStart: "TASK_STARTED",
    SubagentStop: "TASK_COMPLETED",
    PermissionRequest: "TASK_WAITING",
    Stop: "TASK_COMPLETED",
    SessionEnd: "TASK_COMPLETED",
  };
  const type = map[eventName];
  if (!type) return null;
  const state = type.replace("TASK_", "").toLowerCase();
  return {
    type,
    state: state === "started" ? "running" : state === "running" ? "running" : state,
    taskId: id,
    threadId: payload.thread_id || payload.threadId,
    sessionId: payload.session_id || payload.sessionId,
    turnId: payload.turn_id || payload.turnId,
    name: taskTitle(payload),
    progress: type === "TASK_COMPLETED" ? 100 : undefined,
    source: "hooks",
  };
}

function appServerToEvent(message) {
  const method = message?.method;
  const params = message?.params || {};
  const thread = params.thread || {};
  const turn = params.turn || {};
  const status = params.status || thread.status || turn.status;
  const id = thread.id || params.threadId || turn.threadId || turn.id || params.turnId;
  if (!method || !id) return null;
  const base = { taskId: thread.id || params.threadId || turn.threadId || id, threadId: thread.id || params.threadId || turn.threadId, turnId: turn.id || params.turnId, name: thread.name || taskTitle(params), source: "app-server" };

  if (method === "thread/started" || method === "turn/started" || method === "item/started" || method === "item/agentMessage/delta") return { ...base, type: "TASK_RUNNING", state: "running", progress: undefined };
  if (method === "serverRequest" || method.endsWith("/requestApproval") || method.endsWith("/requestUserInput")) return { ...base, type: "TASK_WAITING", state: "waiting" };
  if (method === "turn/completed" || method === "thread/closed" || method === "serverRequest/resolved") {
    const failure = status?.type === "systemError" || status === "failed" || params.error;
    return { ...base, type: failure ? "TASK_FAILED" : "TASK_COMPLETED", state: failure ? "failed" : "completed", progress: failure ? undefined : 100 };
  }
  if (method === "thread/status/changed") {
    const statusType = status?.type || status;
    if (statusType === "active") return { ...base, type: "TASK_RUNNING", state: "running" };
    if (statusType === "idle" || statusType === "notLoaded") return { ...base, type: "TASK_COMPLETED", state: "completed", progress: 100 };
    if (statusType === "systemError") return { ...base, type: "TASK_FAILED", state: "failed" };
  }
  if (method.includes("error") || method.includes("failed")) return { ...base, type: "TASK_FAILED", state: "failed" };
  return null;
}

function nativeEventKind(state) {
  return state === "failed" ? "failed" : state === "waiting" ? "waiting" : "complete";
}

function nativeEventMessage(task) {
  if (task.state === "waiting") return `${task.name} 正在等待你的确认`;
  if (task.state === "failed") return `${task.name} 执行失败，请查看 Codex`;
  return `${task.name} 已完成`;
}

function publishNormalized(event) {
  if (!event) return;
  const previous = tasks.get(taskIdFrom(event));
  const task = upsertTask(event);
  if (["completed", "waiting", "failed"].includes(task.state) && previous?.state !== task.state) {
    void playWindowsAlert(nativeEventKind(task.state));
    sendWindowsNotification({ title: "Codex 提示音", body: nativeEventMessage(task) });
  }
}

function startCodexAppServer() {
  if (process.env.CODEX_NOTIFIER_DISABLE_APP_SERVER === "1") return;
  const command = process.env.CODEX_BIN || (process.platform === "win32" ? "codex.exe" : "codex");
  try {
    codexProcess = spawn(command, ["app-server"], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, env: process.env });
    codexProcess.once("error", (error) => {
      codexProcess = null;
      broadcast({ type: "NETWORK_WARNING", message: `Codex App Server unavailable: ${error.message}` });
    });
    codexProcess.stderr.on("data", () => {});
    const send = (message) => codexProcess?.stdin?.write(`${JSON.stringify(message)}\n`);
    send({ method: "initialize", id: 0, params: { clientInfo: { name: "codex_prompt_sound", title: "Codex 提示音", version: "1.0.0" } } });
    send({ method: "initialized", params: {} });
    const reader = readline.createInterface({ input: codexProcess.stdout });
    reader.on("line", (line) => {
      const message = safeJson(line);
      if (message) publishNormalized(appServerToEvent(message));
    });
    codexProcess.once("exit", () => { codexProcess = null; });
  } catch (error) {
    broadcast({ type: "NETWORK_WARNING", message: `Codex App Server unavailable: ${error.message}` });
  }
}

function requestBody(request, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; if (body.length > limit) request.destroy(new Error("Payload too large")); });
    request.on("end", () => resolve(safeJson(body) || {}));
    request.on("error", reject);
  });
}

export function createServer({ port = PORT, startAppServer = true } = {}) {
  const server = http.createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }

    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, codexAppServer: Boolean(codexProcess), hookEndpoint: `http://127.0.0.1:${port}/hook` }));
      return;
    }
    if (request.method === "GET" && request.url === "/tasks") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ tasks: [...tasks.values()] }));
      return;
    }
    if (request.method === "GET" && request.url === "/settings") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ settings: publicNotifierSettings(readNotifierSettings()) }));
      return;
    }
    if (request.method === "POST" && request.url === "/settings") {
      const body = await requestBody(request);
      const allowed = ["lang", "selectedPet", "soundOn", "nativeNotifications", "vibrationOn", "soundSource"];
      const next = Object.fromEntries(allowed.filter((key) => key in body).map((key) => [key, body[key]]));
      const settings = await writeNotifierSettings(next);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ settings: publicNotifierSettings(settings) }));
      return;
    }
    if (request.method === "POST" && request.url === "/settings/sound") {
      const body = await requestBody(request, 3_000_000);
      const base64 = String(body.data || "").replace(/^data:[^;]+;base64,/, "");
      const byteLength = Math.floor((base64.length * 3) / 4);
      const extension = String(body.name || "").match(/\.(wav|mp3|ogg)$/i)?.[1]?.toLowerCase();
      if (!base64 || !extension || byteLength > 2_000_000) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "仅支持不超过 2MB 的 WAV、MP3 或 OGG 音频。" }));
        return;
      }
      const soundDirectory = path.join(getNotifierDirectory(), "sounds");
      await fs.promises.mkdir(soundDirectory, { recursive: true });
      const target = path.join(soundDirectory, `custom-${Date.now()}.${extension}`);
      await fs.promises.writeFile(target, Buffer.from(base64, "base64"));
      const settings = await writeNotifierSettings({ soundSource: "custom", customSoundPath: target, customSoundName: String(body.name).slice(0, 120) });
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ settings: publicNotifierSettings(settings) }));
      return;
    }
    if (request.method === "POST" && request.url === "/alert") {
      const body = await requestBody(request);
      await playWindowsAlert(body.kind || "complete");
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.method === "GET" && request.url === "/events") {
      response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      response.write(`data: ${JSON.stringify({ type: "BRIDGE_READY", codexAppServer: Boolean(codexProcess), tasks: [...tasks.values()], settings: publicNotifierSettings(readNotifierSettings()) })}\n\n`);
      clients.add(response);
      request.on("close", () => clients.delete(response));
      return;
    }
    if (request.method === "POST" && request.url === "/hook") {
      const body = await requestBody(request);
      publishNormalized(hookToEvent(body.event || request.headers["x-codex-notifier-event"], body.payload || body));
      response.writeHead(204);
      response.end();
      return;
    }
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Not found" }));
  });

  return {
    server,
    listen() {
      return new Promise((resolve) => server.listen(port, "127.0.0.1", () => {
        if (startAppServer) startCodexAppServer();
        resolve(server);
      }));
    },
    close() {
      codexProcess?.kill();
      for (const response of clients) response.end();
      clients.clear();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  const app = createServer();
  app.listen().then(() => console.log(`Codex 提示音 bridge listening on http://127.0.0.1:${PORT}`));
  process.on("SIGINT", () => app.close().then(() => process.exit(0)));
  process.on("SIGTERM", () => app.close().then(() => process.exit(0)));
}
