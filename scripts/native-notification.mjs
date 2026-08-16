import { spawn } from "node:child_process";
import { readNotifierSettings } from "./notifier-settings.mjs";

function escapeXml(value = "") {
  return String(value).replace(/[<>&'\"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;" })[character]);
}

export function sendWindowsNotification({ title = "Codex 提示音", body = "Codex 有新的任务状态" } = {}) {
  if (process.platform !== "win32" || process.env.CODEX_NOTIFIER_NATIVE_NOTIFICATION === "0") return;
  if (!readNotifierSettings().nativeNotifications) return;

  const xml = `<toast><visual><binding template="ToastGeneric"><text>${escapeXml(title)}</text><text>${escapeXml(body)}</text></binding></visual><audio silent="true"/></toast>`;
  const command = [
    "Add-Type -AssemblyName System.Runtime.WindowsRuntime",
    "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] | Out-Null",
    "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType=WindowsRuntime] | Out-Null",
    "$xml = New-Object Windows.Data.Xml.Dom.XmlDocument",
    `$xml.LoadXml('${xml.replace(/'/g, "''")}')`,
    "$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)",
    "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Codex 提示音').Show($toast)",
  ].join("; ");

  try {
    const child = spawn(
      `${process.env.WINDIR || "C:\\Windows"}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
      ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", command],
      { detached: true, stdio: "ignore", windowsHide: true },
    );
    child.on("error", () => {});
    child.unref();
  } catch {
    // Native notifications are best-effort and never block Codex.
  }
}
