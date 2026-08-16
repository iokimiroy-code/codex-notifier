const DEFAULT_BRIDGE_URL = "http://127.0.0.1:43123";

function getBridgeUrl() {
  return (import.meta.env.VITE_CODEX_BRIDGE_URL || DEFAULT_BRIDGE_URL).replace(/\/$/, "");
}

function parseEvent(data) {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function subscribeToCodexEvents({ onEvent, onStatus }) {
  let stopped = false;
  let eventSource;
  let retryTimer;
  const unlistenCallbacks = [];

  const connectBrowserBridge = () => {
    if (stopped) return;
    onStatus("connecting");
    eventSource = new EventSource(`${getBridgeUrl()}/events`);
    eventSource.onopen = () => onStatus("connected");
    eventSource.onmessage = (message) => {
      const event = parseEvent(message.data);
      if (!event) return;
      if (event.type === "BRIDGE_READY") {
        onStatus(event.codexAppServer ? "connected" : "hook-ready");
        onEvent(event);
        return;
      }
      if (event.type === "TASK_SNAPSHOT") {
        onEvent(event);
        return;
      }
      onEvent(event);
    };
    eventSource.onerror = () => {
      eventSource?.close();
      eventSource = undefined;
      if (!stopped) {
        onStatus("disconnected");
        retryTimer = window.setTimeout(connectBrowserBridge, 2400);
      }
    };
  };

  const connect = async () => {
    const tauriEvent = window.__TAURI__?.event;
    if (tauriEvent?.listen) {
      onStatus("native");
      unlistenCallbacks.push(await tauriEvent.listen("codex-event", (event) => onEvent(event.payload)));
      unlistenCallbacks.push(await tauriEvent.listen("codex-status", (event) => onStatus(event.payload?.status || "native")));
      return;
    }
    connectBrowserBridge();
  };

  connect();

  return () => {
    stopped = true;
    window.clearTimeout(retryTimer);
    eventSource?.close();
    unlistenCallbacks.forEach((callback) => callback?.());
  };
}

async function bridgeRequest(path, options = {}) {
  const response = await fetch(`${getBridgeUrl()}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "本地通知器未响应");
  return response.status === 204 ? null : response.json();
}

export function loadNotifierSettings() {
  return bridgeRequest("/settings");
}

export function saveNotifierSettings(settings) {
  return bridgeRequest("/settings", { method: "POST", body: JSON.stringify(settings) });
}

export async function uploadCustomSound(file) {
  if (!file) throw new Error("请先选择音频文件。");
  if (file.size > 2_000_000) throw new Error("提示音不能超过 2MB。");
  if (!/\.(wav|mp3|ogg)$/i.test(file.name)) throw new Error("请选择 WAV、MP3 或 OGG 文件。");
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取音频失败。"));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
  return bridgeRequest("/settings/sound", { method: "POST", body: JSON.stringify({ name: file.name, data }) });
}

export function requestNativeAlert(kind = "complete") {
  return bridgeRequest("/alert", { method: "POST", body: JSON.stringify({ kind }) });
}

export { getBridgeUrl };
