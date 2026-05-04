# Render Dependency Fix v2.3

This version fixes the Render build error:

```txt
ERESOLVE could not resolve
peerOptional opusscript@^0.0.8 from prism-media@1.3.5
Found: opusscript@0.1.1
```

## What changed

- Removed `opusscript` from `package.json`.
- Added `@discordjs/opus` for Discord voice audio.
- Locked Render/Node to Node 20 LTS instead of Node 25.
- Added `.npmrc` with `legacy-peer-deps=true` as a safety net.
- Added `NODE_VERSION=20.18.1` in `render.yaml`.

## Render settings

Use a **Background Worker**, not Web Service.

Build command:

```bash
npm install && python3 -m pip install vosk piper-tts && npm run download:vosk-model
```

Start command:

```bash
npm start
```

Required environment variable:

```txt
DISCORD_TOKEN=your_bot_token
```
