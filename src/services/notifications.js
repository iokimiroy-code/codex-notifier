export async function notifyUser({ title, body }) {
  try {
    const tauriNotification = window.__TAURI__?.notification;
    if (tauriNotification?.sendNotification) {
      await tauriNotification.sendNotification({ title, body });
      return true;
    }

    if (!("Notification" in window)) return false;
    let permission = Notification.permission;
    if (permission === "default") permission = await Notification.requestPermission();
    if (permission !== "granted") return false;
    new Notification(title, { body, silent: true });
    return true;
  } catch {
    return false;
  }
}

export function playAlert(kind = "complete") {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const frequencies = kind === "failed" ? [180, 140] : kind === "waiting" ? [440, 520] : [660, 880];
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequencies[0], context.currentTime);
    oscillator.frequency.setValueAtTime(frequencies[1], context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.24);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.26);
    oscillator.addEventListener("ended", () => context.close(), { once: true });
  } catch {
    // Audio is an enhancement; state and OS notifications still work when unavailable.
  }
}

