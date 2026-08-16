import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;
const bridge = spawn(node, [path.join(root, "bridge", "server.mjs")], { cwd: root, stdio: "inherit", env: process.env });
const vite = spawn(node, [path.join(root, "node_modules", "vite", "bin", "vite.js")], { cwd: root, stdio: "inherit", env: process.env });

function stop() {
  bridge.kill();
  vite.kill();
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
bridge.on("exit", (code) => { if (code && code !== 0) vite.kill(); });
vite.on("exit", (code) => { stop(); process.exit(code || 0); });

