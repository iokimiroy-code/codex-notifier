import { playWindowsAlert } from "./native-alert.mjs";
import { sendWindowsNotification } from "./native-notification.mjs";

const eventName = process.argv[2] || "Unknown";
let body = "";
for await (const chunk of process.stdin) body += chunk;

let payload = {};
try { payload = body ? JSON.parse(body) : {}; } catch { payload = { raw: body }; }

let delivered = false;
try {
  const response = await fetch(process.env.CODEX_NOTIFIER_BRIDGE_URL || "http://127.0.0.1:43123/hook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-codex-notifier-event": eventName },
    body: JSON.stringify({ event: eventName, payload }),
    signal: AbortSignal.timeout(1800),
  });
  delivered = response.ok;
} catch {
  // The hook must never interrupt Codex when the notifier is not running.
}

if (!delivered && eventName === "PermissionRequest") {
  await playWindowsAlert("waiting");
  sendWindowsNotification({ body: "Codex 正在等待你的确认" });
}
if (!delivered && eventName === "Stop") {
  await playWindowsAlert("complete");
  sendWindowsNotification({ body: "Codex 任务已完成" });
}

if (eventName === "Stop") process.stdout.write(JSON.stringify({ continue: true }));
