const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const AUDIO_DIR = path.join(process.cwd(), "public", "audio");
const KOKORO_SCRIPT = path.join(process.cwd(), "scripts", "kokoro_tts.py");

function ensureAudioDir() {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

function safeText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function pickTrafficVoice(callsign = "") {
  const c = String(callsign || "").toUpperCase();
  // Keep traffic voices distinct from ATC, but avoid browser voices.
  if (c.includes("BWA") || c.includes("CARIBBEAN")) return "am_adam";
  if (c.includes("CWG") || c.includes("WINGS")) return "af_heart";
  if (c.includes("SLW") || c.includes("SILVER")) return "bf_emma";
  return "af_heart";
}

function runKokoro({ text, callsign, voice, speed = 1.0, timeoutMs = 20000 }) {
  return new Promise((resolve, reject) => {
    ensureAudioDir();

    const clean = safeText(text);
    if (!clean) return reject(new Error("No text supplied for Kokoro traffic TTS"));

    const id = `${Date.now()}-${crypto.randomBytes(5).toString("hex")}`;
    const fileName = `traffic-kokoro-${id}.wav`;
    const outPath = path.join(AUDIO_DIR, fileName);
    const selectedVoice = voice || pickTrafficVoice(callsign);

    const child = spawn("python3", [
      KOKORO_SCRIPT,
      "--text", clean,
      "--out", outPath,
      "--voice", selectedVoice,
      "--speed", String(speed),
      "--lang", "a"
    ], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`Kokoro traffic TTS timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", d => stdout += d.toString());
    child.stderr.on("data", d => stderr += d.toString());

    child.on("error", err => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (code !== 0) {
        return reject(new Error(`Kokoro exited ${code}: ${stderr || stdout}`));
      }

      if (!fs.existsSync(outPath)) {
        return reject(new Error(`Kokoro did not create audio file: ${outPath}`));
      }

      resolve({
        ok: true,
        engine: "kokoro",
        role: "traffic",
        voice: selectedVoice,
        audioUrl: `/audio/${fileName}`,
        fileName
      });
    });
  });
}

module.exports = {
  runKokoro,
  pickTrafficVoice
};
