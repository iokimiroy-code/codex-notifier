import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const DEFAULT_NOTIFIER_SETTINGS = Object.freeze({
  lang: "zh",
  selectedPet: "dog",
  soundOn: true,
  nativeNotifications: true,
  soundSource: "builtin",
  customSoundPath: "",
  customSoundName: "",
});

export function getNotifierDirectory(root = path.join(os.homedir(), ".codex")) {
  return path.join(root, "codex-notifier");
}

export function getNotifierSettingsPath(root) {
  return path.join(getNotifierDirectory(root), "settings.json");
}

export function readNotifierSettings(root) {
  try {
    const saved = JSON.parse(fs.readFileSync(getNotifierSettingsPath(root), "utf8"));
    return { ...DEFAULT_NOTIFIER_SETTINGS, ...saved };
  } catch {
    return { ...DEFAULT_NOTIFIER_SETTINGS };
  }
}

export async function writeNotifierSettings(partial, root) {
  const directory = getNotifierDirectory(root);
  await fs.promises.mkdir(directory, { recursive: true });
  const next = { ...readNotifierSettings(root), ...partial };
  await fs.promises.writeFile(getNotifierSettingsPath(root), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export function publicNotifierSettings(settings) {
  const { customSoundPath, ...safe } = settings;
  return safe;
}
