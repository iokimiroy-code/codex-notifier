import { spawn } from "node:child_process";
import { playWindowsAlert } from "./native-alert.mjs";
import { sendWindowsNotification } from "./native-notification.mjs";

const args = process.argv.slice(2);
const payloadIndex = args.findIndex((arg) => arg.trim().startsWith("{"));
const rawPayload = payloadIndex >= 0 ? args[payloadIndex] : "{}";
const fixedArgs = payloadIndex >= 0 ? args.slice(0, payloadIndex) : args;
let payload = {};

try {
  payload = JSON.parse(rawPayload);
} catch {
  payload = { raw: rawPayload };
}

function forwardExistingNotify() {
  const existingNotify = process.env.CODEX_NOTIFIER_EXISTING_NOTIFY
    || fixedArgs.find((arg) => /\.exe$/i.test(arg));
  if (!existingNotify) return;

  try {
    const child = spawn(existingNotify, ["turn-ended", rawPayload], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", () => {});
    child.unref();
  } catch {
    // The existing Codex notification remains best-effort.
  }
}

async function publishCompletion() {
  const taskId = payload["thread-id"] || payload.threadId || payload["turn-id"] || payload.turnId || "codex-live";
  const name = payload["last-assistant-message"] || payload.title || "Codex 任务";
  try {
    const response = await fetch(process.env.CODEX_NOTIFIER_BRIDGE_URL || "http://127.0.0.1:43123/hook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-codex-notifier-event": "Stop" },
      body: JSON.stringify({
        event: "Stop",
        payload: { ...payload, taskId, name },
      }),
      signal: AbortSignal.timeout(1800),
    });
    return response.ok;
  } catch {
    // The notifier must never interrupt Codex when it is not running.
  }
  return false;
}

if (payload.type === "agent-turn-complete" || !payload.type) {
  forwardExistingNotify();
  const delivered = await publishCompletion();
  if (!delivered) {
    await playWindowsAlert("complete");
    sendWindowsNotification({ body: "Codex 任务已完成" });
  }
}
