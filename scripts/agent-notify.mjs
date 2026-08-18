const bridgeUrl = (process.env.CODEX_NOTIFIER_BRIDGE_URL || "http://127.0.0.1:43123").replace(/\/$/, "");

function readOption(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const args = process.argv.slice(2);
const state = readOption(args, "--state") || readOption(args, "--status") || args[0];
const taskId = readOption(args, "--id") || readOption(args, "--task-id");
const name = readOption(args, "--name") || readOption(args, "--title");
const source = readOption(args, "--source") || process.env.CODEX_NOTIFIER_AGENT || "external-agent";
const progress = readOption(args, "--progress");

if (!state) {
  console.error("Usage: pnpm run notify:agent -- --state completed --id task-1 --name \"Build project\" --source workbuddy");
  process.exit(2);
}

const payload = { state, source };
if (taskId) payload.taskId = taskId;
if (name) payload.name = name;
if (progress !== undefined && Number.isFinite(Number(progress))) payload.progress = Number(progress);

const response = await fetch(`${bridgeUrl}/agent-event`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload),
});

if (!response.ok) {
  console.error(await response.text());
  process.exit(1);
}

console.log(`已发送 ${source} 事件：${state}`);
