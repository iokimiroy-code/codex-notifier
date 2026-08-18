import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readNotifierSettings } from "./notifier-settings.mjs";

const BUNDLED_DOG_SOUND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "sounds", "dog-complete.mp3");

export function playWindowsAlert(kind = "complete") {
  if (process.platform !== "win32" || process.env.CODEX_NOTIFIER_NATIVE_SOUND === "0") return Promise.resolve();

  const settings = readNotifierSettings();
  if (!settings.soundOn) return Promise.resolve();

  const customPath = settings.soundSource === "custom" && settings.customSoundPath;
  if (customPath) return playCustomAlert(customPath);

  if (kind === "complete" && settings.selectedPet === "dog" && existsSync(BUNDLED_DOG_SOUND)) {
    return playCustomAlert(BUNDLED_DOG_SOUND);
  }

  return playBuiltInAlert(kind, settings.selectedPet);
}

function playCustomAlert(customPath) {
  const extension = path.extname(customPath).toLowerCase();
  const escapedPath = customPath.replace(/'/g, "''");
  const command = extension === ".wav"
    ? [
      `$player = New-Object System.Media.SoundPlayer('${escapedPath}')`,
      "$player.Load()",
      "$player.PlaySync()",
      "$player.Dispose()",
    ].join("; ")
    : [
      "Add-Type -AssemblyName PresentationCore",
      "$player = New-Object System.Windows.Media.MediaPlayer",
      `$player.Open([Uri]'${escapedPath}')`,
      "$player.Play()",
      "Start-Sleep -Milliseconds 1400",
      "$player.Close()",
    ].join("; ");

  return runPowerShell(command);
}

function playBuiltInAlert(kind, pet = "dog") {
  const profile = getSoundProfile(kind, pet);
  const [firstFrequency, secondFrequency] = profile.frequencies;

  const powershell = [
    "$sampleRate = 44100",
    "$duration = 0.32",
    "$frames = [int]($sampleRate * $duration)",
    "$dataSize = $frames * 2",
    "$stream = New-Object System.IO.MemoryStream",
    "$writer = New-Object System.IO.BinaryWriter($stream)",
    "$ascii = [System.Text.Encoding]::ASCII",
    "$writer.Write($ascii.GetBytes('RIFF'))",
    "$writer.Write([int32](36 + $dataSize))",
    "$writer.Write($ascii.GetBytes('WAVE'))",
    "$writer.Write($ascii.GetBytes('fmt '))",
    "$writer.Write([int32]16)",
    "$writer.Write([int16]1)",
    "$writer.Write([int16]1)",
    "$writer.Write([int32]$sampleRate)",
    "$writer.Write([int32]($sampleRate * 2))",
    "$writer.Write([int16]2)",
    "$writer.Write([int16]16)",
    "$writer.Write($ascii.GetBytes('data'))",
    "$writer.Write([int32]$dataSize)",
    "$random = New-Object System.Random 26",
    `for ($i = 0; $i -lt $frames; $i++) { $phase = $i / $sampleRate; $frequency = if ($i -lt ($frames / 2)) { ${firstFrequency} } else { ${secondFrequency} }; $envelope = [math]::Min(1, $i / 900) * [math]::Min(1, ($frames - $i) / 1300); $tone = [math]::Sin(2 * [math]::PI * $frequency * $phase); $texture = ${profile.texture} * (($random.NextDouble() * 2) - 1); $sample = [int16](($tone + $texture) * $envelope * ${profile.amplitude}); $writer.Write($sample) }`,
    "$writer.Flush()",
    "$stream.Position = 0",
    "$player = New-Object System.Media.SoundPlayer($stream)",
    "$player.PlaySync()",
    "$player.Dispose()",
    "$writer.Dispose()",
    "$stream.Dispose()",
  ].join("; ");

  return runPowerShell(powershell);
}

function getSoundProfile(kind, pet) {
  if (kind === "failed") return { frequencies: [230, 155], texture: 0.04, amplitude: 18000 };
  if (kind === "waiting") return { frequencies: [520, 720], texture: 0.02, amplitude: 18000 };
  if (pet === "dog") return { frequencies: [185, 135], texture: 0.28, amplitude: 24000 };
  if (pet === "cat") return { frequencies: [700, 980], texture: 0.02, amplitude: 16000 };
  if (pet === "robot") return { frequencies: [440, 660], texture: 0, amplitude: 17000 };
  if (pet === "seal") return { frequencies: [290, 360], texture: 0.1, amplitude: 19000 };
  return { frequencies: [900, 1240], texture: 0.04, amplitude: 16000 };
}

function runPowerShell(command) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    try {
      const child = spawn(
      `${process.env.WINDIR || "C:\\Windows"}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
      ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", command],
      { stdio: "ignore", windowsHide: true },
    );
      child.once("error", finish);
      child.once("close", finish);
    } catch {
      // Native sound is best-effort and must never interrupt Codex.
      finish();
    }
  });
}
