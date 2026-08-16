import http from "node:http";
import { spawn } from "node:child_process";
import readline from "node:readline";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
  delete publicTask.startedAt;
  delete publicTask.updatedAt;
  broadcast(publicTask);
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

function publishNormalized(event) {
  if (!event) return;
  upsertTask(event);
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

function requestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; if (body.length > 1_000_000) request.destroy(new Error("Payload too large")); });
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
    if (request.method === "GET" && request.url === "/events") {
      response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      response.write(`data: ${JSON.stringify({ type: "BRIDGE_READY", codexAppServer: Boolean(codexProcess), tasks: [...tasks.values()] })}\n\n`);
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
