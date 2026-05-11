# SkyEcho Kokoro Traffic Voice Patch

Purpose:
- Add Kokoro as the AI traffic pilot voice engine.
- Keep SkyEchoCabin ATC controller voices untouched.
- Disable browser voice fallback for AI traffic pilots.
- Keep Piper as fallback for AI traffic only.

This patch is designed to be added to the existing SkyEcho backend/frontend without replacing the whole app.

## Backend deployment requirements

Render must install:
- Python packages: `kokoro`, `soundfile`, `numpy`
- System package: `espeak-ng`

If your Render service uses a Dockerfile, use the included `Dockerfile.kokoro.example`.

If your Render service uses normal Render build/start commands, use:

Build command:
```bash
apt-get update && apt-get install -y espeak-ng && pip install -r requirements-kokoro.txt && yarn install
```

Start command:
```bash
npm start
```

If Render does not allow apt-get in your current environment, switch the backend service to Docker.

## Files included

- `requirements-kokoro.txt`
- `scripts/kokoro_tts.py`
- `src/kokoroTrafficVoice.js`
- `FRONTEND_PATCH_kokoro_traffic_audio_queue.js`
- `BACKEND_INDEX_PATCH_EXAMPLE.js`
- `Dockerfile.kokoro.example`

## How this should work

1. Frontend detects AI traffic pilot request/readback text.
2. Frontend calls backend Kokoro traffic TTS endpoint.
3. Backend runs `scripts/kokoro_tts.py`.
4. Kokoro writes a WAV file into `/audio`.
5. Backend returns the audio URL.
6. Frontend queues that audio through the same guarded traffic audio queue.
7. Browser speech synthesis is not used for AI traffic unless you manually re-enable it.

## Correct voice routing

- SkyEchoCabin ATC controller voice: unchanged.
- AI traffic pilots: Kokoro primary.
- Piper traffic voice: fallback only.
- Browser traffic voice: disabled by default.

## Test phrase

After deployment, test with:

```bash
curl -X POST https://YOUR-BACKEND-URL/api/traffic/kokoro-tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Clearance, Caribbean Wings five five six six, request IFR clearance to TGPY.","callsign":"CWG5566","voice":"af_heart"}'
```

Expected response:

```json
{
  "ok": true,
  "engine": "kokoro",
  "role": "traffic",
  "audioUrl": "/audio/..."
}
```

Then open the returned audio URL in the browser. You should hear the AI traffic pilot voice.
