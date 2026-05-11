/*
Add this to src/index.js WITHOUT replacing your existing routes.

Put near the top:
const { runKokoro } = require("./kokoroTrafficVoice");

Then add this route after app.use(express.json(...)) and after static audio serving is configured.

IMPORTANT:
- This endpoint is for AI TRAFFIC PILOT voice only.
- Do not use it for SkyEchoCabin ATC controller voice.
*/

app.post("/api/traffic/kokoro-tts", async (req, res) => {
  try {
    const { text, callsign, voice, speed } = req.body || {};

    if (!text || !String(text).trim()) {
      return res.status(400).json({
        ok: false,
        error: "Missing text for Kokoro traffic TTS"
      });
    }

    const result = await runKokoro({
      text,
      callsign,
      voice,
      speed: Number(speed || 1.0),
      timeoutMs: 22000
    });

    console.log(`[KOKORO] generated role=traffic voice=${result.voice} ${result.audioUrl}`);
    return res.json(result);

  } catch (err) {
    console.error("[KOKORO] traffic TTS failed:", err && err.message ? err.message : err);
    return res.status(502).json({
      ok: false,
      engine: "kokoro",
      role: "traffic",
      error: String(err && err.message ? err.message : err)
    });
  }
});
