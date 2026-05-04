# Piper TTS Fix

The previous build only recognized `TTS_MODE=piper_http`, so `TTS_MODE=piper` printed `[TTS disabled]`.

This version recognizes:

- `TTS_MODE=piper` for local Piper CLI
- `TTS_MODE=piper_http` for an external Piper server
- `ATC_TTS_MODE=piper`
- `TRAFFIC_TTS_MODE=discord` mapped to the default traffic voice path for now
- `CABIN_TTS_MODE=piper`

Render build command:

```bash
npm install && python3 -m pip install vosk piper-tts && npm run download:piper-voice
```

Start command:

```bash
npm start
```
