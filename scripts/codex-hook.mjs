const eventName = process.argv[2] || "Unknown";
let body = "";
for await (const chunk of process.stdin) body += chunk;

let payload = {};
try { payload = body ? JSON.parse(body) : {}; } catch { payload = { raw: body }; }

try {
  await fetch(process.env.CODEX_NOTIFIER_BRIDGE_URL || "http://127.0.0.1:43123/hook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-codex-notifier-event": eventName },
    body: JSON.stringify({ event: eventName, payload }),
    signal: AbortSignal.timeout(1800),
  });
} catch {
  // The hook must never interrupt Codex when the notifier is not running.
}

if (eventName === "Stop") process.stdout.write(JSON.stringify({ continue: true }));

