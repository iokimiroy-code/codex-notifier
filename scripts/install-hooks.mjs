import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const codexDir = process.env.CODEX_NOTIFIER_CODEX_DIR || path.join(os.homedir(), ".codex");
const hooksFile = path.join(codexDir, "hooks.json");
const script = path.join(root, "scripts", "codex-hook.mjs");
const events = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "SubagentStart", "SubagentStop", "PermissionRequest", "Stop", "SessionEnd"];

function readConfig() {
  if (!existsSync(hooksFile)) return { description: "Codex 提示音 hooks", hooks: {} };
  try { return JSON.parse(readFileSync(hooksFile, "utf8")); } catch { throw new Error(`无法读取 ${hooksFile}，请先修复 JSON 格式。`); }
}

function isNotifierGroup(group) {
  return JSON.stringify(group).includes("codex-hook.mjs");
}

function handler(event, windows = false) {
  const command = `"${process.execPath}" "${script}" ${event}`;
  return {
    type: "command",
    ...(windows ? { commandWindows: command } : { command }),
    async: true,
    timeout: 3,
    statusMessage: `Codex 提示音: ${event}`,
  };
}

function install() {
  const config = readConfig();
  config.description ||= "Codex 提示音 hooks";
  config.hooks ||= {};
  for (const event of events) {
    const groups = Array.isArray(config.hooks[event]) ? config.hooks[event].filter((group) => !isNotifierGroup(group)) : [];
    groups.push({ hooks: [handler(event, process.platform === "win32")] });
    config.hooks[event] = groups;
  }
  mkdirSync(codexDir, { recursive: true });
  writeFileSync(hooksFile, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  console.log(`已安装 Codex 提示音 Hook：${hooksFile}`);
  console.log("请在 Codex 中运行 /hooks，检查并信任 Codex 提示音的命令 Hook。启动 pnpm run start 后即可接收事件。");
}

function uninstall() {
  const config = readConfig();
  for (const event of events) {
    if (!Array.isArray(config.hooks?.[event])) continue;
    config.hooks[event] = config.hooks[event].filter((group) => !isNotifierGroup(group));
    if (!config.hooks[event].length) delete config.hooks[event];
  }
  mkdirSync(codexDir, { recursive: true });
  writeFileSync(hooksFile, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  console.log(`已移除 Codex 提示音 Hook：${hooksFile}`);
}

if (process.argv[2] === "uninstall") uninstall();
else install();
