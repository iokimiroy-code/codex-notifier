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
