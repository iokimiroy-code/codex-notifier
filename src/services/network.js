import { getBridgeUrl } from "./notifierBridge.js";

function statusFromProbe({ online, latency, healthy }) {
  if (!online || !healthy) return "bad";
  return latency > 650 ? "unstable" : "good";
}

export function subscribeToNetworkStatus(onChange) {
  let stopped = false;
  let timer;

  const probe = async () => {
    const online = navigator.onLine;
    const startedAt = performance.now();
    let healthy = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 1800);
    try {
      const response = await fetch(`${getBridgeUrl()}/health?_=${Date.now()}`, { cache: "no-store", signal: controller.signal });
      healthy = response.ok;
    } catch {
      healthy = false;
    } finally {
      window.clearTimeout(timeout);
    }
    if (!stopped) onChange({ status: statusFromProbe({ online, healthy, latency: performance.now() - startedAt }), latency: Math.round(performance.now() - startedAt), online, healthy });
  };

  const schedule = () => {
    window.clearTimeout(timer);
    void probe();
    timer = window.setTimeout(schedule, 12_000);
  };
  const handleOnline = () => schedule();
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOnline);
  schedule();

  return () => {
    stopped = true;
    window.clearTimeout(timer);
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOnline);
  };
}
