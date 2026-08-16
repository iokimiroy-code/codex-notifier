import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const codexDir = process.env.CODEX_NOTIFIER_CODEX_DIR || path.join(os.homedir(), ".codex");
const configPath = path.join(codexDir, "config.toml");
const backupPath = path.join(codexDir, "codex-notifier-notify-backup.json");
const scriptPath = path.join(root, "scripts", "codex-notify.mjs");

function readConfig() {
  return existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
}

function parseNotifyLine(line) {
  if (!line) return null;
  const raw = line.slice(line.indexOf("=") + 1).trim();
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
  } catch {
    return null;
  }
}

function isNotifierCommand(value) {
  return Array.isArray(value) && value.some((item) => item.includes("codex-notify.mjs"));
}

function install() {
  const original = readConfig();
  const lines = original ? original.split(/\r?\n/) : [];
  const notifyIndex = lines.findIndex((line) => /^\s*notify\s*=/.test(line));
  const existing = notifyIndex >= 0 ? parseNotifyLine(lines[notifyIndex]) : null;
  if (isNotifierCommand(existing)) {
    console.log(`Codex 提示音 notify 已安装：${configPath}`);
    return;
  }

  mkdirSync(codexDir, { recursive: true });
  writeFileSync(backupPath, JSON.stringify({ line: notifyIndex >= 0 ? lines[notifyIndex] : null }, null, 2), "utf8");
  const command = [process.execPath, scriptPath, ...(existing || [])];
  const line = `notify = ${JSON.stringify(command)}`;
  if (notifyIndex >= 0) lines[notifyIndex] = line;
  else lines.unshift(line);
  writeFileSync(configPath, `${lines.join("\n").replace(/\n+$/, "")}\n`, "utf8");
  console.log(`已安装 Codex 提示音 notify：${configPath}`);
  console.log("重启 Codex 后，任务完成会自动发送给 Codex 提示音。");
}

function uninstall() {
  if (!existsSync(configPath)) return;
  const lines = readConfig().split(/\r?\n/);
  const notifyIndex = lines.findIndex((line) => /^\s*notify\s*=/.test(line));
  if (notifyIndex < 0 || !isNotifierCommand(parseNotifyLine(lines[notifyIndex]))) return;

  let backup = null;
  if (existsSync(backupPath)) {
    try { backup = JSON.parse(readFileSync(backupPath, "utf8")); } catch { backup = null; }
  }
  if (backup?.line) lines[notifyIndex] = backup.line;
  else lines.splice(notifyIndex, 1);
  writeFileSync(configPath, `${lines.join("\n").replace(/\n+$/, "")}\n`, "utf8");
  console.log(`已移除 Codex 提示音 notify：${configPath}`);
}

if (process.argv[2] === "uninstall") uninstall();
else install();
