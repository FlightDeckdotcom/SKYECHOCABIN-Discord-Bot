# SkyEcho ATC Discord Bridge v1

Ultra Strict Mode starter build for the architecture:

```text
SkyEcho ATC Logic Engine
  -> Synthetic AI Traffic Layer
  -> TTS Adapter
  -> Discord Bot Voice Bridge
  -> Xbox Discord Voice Channel
  -> Xbox pilot hears ATC while flying MSFS 2024
```

## What is included

- Express backend API
- Browser test console at `http://localhost:8787`
- ATC state engine: clearance, pushback, taxi, takeoff, departure, enroute, descent, approach, landing
- Readback validation using vital-data checks rather than exact string matching
- Synthetic AI traffic generator
- Discord slash commands
- Discord mute/unmute PTT event logging
- TTS adapters:
  - `mock` mode: no audio, logs/text only
  - `piper-http`: expects a Piper HTTP TTS endpoint returning WAV
  - `elevenlabs`: uses ElevenLabs TTS and caches MP3

## Important v1 limitation

This v1 intentionally does **not** yet capture raw Discord user audio for STT. It logs Discord mute/unmute events so the PTT gate is ready, but pilot input is sent through:

- `/pilot text: ...` Discord slash command, or
- the browser test console

This keeps the ATC logic, traffic layer, TTS output, and Discord bridge testable before adding voice receive/STT complexity.

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` with your Discord bot credentials.

Register commands:

```bash
npm run register
```

Start server:

```bash
npm start
```

Open:

```text
http://localhost:8787
```

## Discord commands

```text
/join
/leave
/start_atc callsign:LIAT319 route:TKPK SKB G633 ANU DCT TAPA cruise:FL310
/pilot text:Clearance, LIAT 319, request IFR clearance to TAPA.
/traffic
/repeat_last
```

## Xbox flow

1. Start this server on your MacBook or host.
2. Invite the Discord bot to your server.
3. Join the Discord voice channel from Xbox.
4. Use `/join` so the bot joins the same voice channel.
5. Use `/start_atc`.
6. Use `/pilot` for v1 testing, or web console PTT/text input.
7. Bot will speak through Discord once TTS mode returns playable audio.

## TTS modes

### Mock mode

Default. Safe for first run. Does not play audio; it writes cached text files and logs transmissions.

```env
TTS_MODE=mock
```

### Piper HTTP mode

```env
TTS_MODE=piper-http
PIPER_TTS_URL=http://127.0.0.1:5000/api/tts
```

The endpoint should accept JSON:

```json
{ "text": "ATC line here", "role": "atc" }
```

and return WAV bytes.

### ElevenLabs mode

```env
TTS_MODE=elevenlabs
ELEVENLABS_API_KEY=your_key
ELEVENLABS_VOICE_ATC=voice_id
ELEVENLABS_VOICE_TRAFFIC=voice_id
```

## API endpoints

```text
GET  /api/health
POST /api/session
GET  /api/sessions
GET  /api/session/:id
POST /api/session/:id/pilot-text
POST /api/session/:id/traffic
POST /api/session/:id/discord-speak
```

## Next build phase

- Add Discord audio receive pipeline
- Add STT adapter: Whisper/Deepgram/AssemblyAI
- Convert mute/unmute state into true audio capture windows
- Add traffic deconfliction logic so ATC can call out synthetic traffic to the pilot
- Add SimBrief route import
- Add frequency/sector voice switching

## v1.2 Discord Voice Receive + STT

This build adds the first real Discord mute/unmute PTT receive pipeline.

Flow:

```text
Pilot unmutes in Discord = recording starts
Pilot speaks
Pilot mutes again = recording stops
SkyEcho saves a WAV file in ./recordings
STT transcribes it
ATC engine processes the transcript
Discord bot speaks the ATC response back into the voice channel
```

### STT modes

Keep this while testing text commands only:

```env
STT_MODE=manual
```

Use this to test the PTT pipeline without an API key. The bot will pretend every recording said the text in `STT_MOCK_TEXT`:

```env
STT_MODE=mock
STT_MOCK_TEXT=Clearance, LIAT 319, request IFR clearance to TAPA.
```

Use this for real speech-to-text:

```env
STT_MODE=openai-whisper
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_STT_MODEL=whisper-1
```

After changing `.env`, stop and restart `npm start`.

### Required testing order

1. Start Piper in Terminal 1:

```bash
npm run piper
```

2. Start SkyEcho in Terminal 2:

```bash
npm start
```

3. In Discord, join voice, then run:

```text
/join
/start_atc callsign:LIAT319 route:TKPK SKB G633 ANU DCT TAPA cruise:FL310
/stt_status
```

4. For PTT test, unmute, speak, then mute again. Watch Terminal for:

```text
[VoiceRX] Recording started
[VoiceRX] Recording saved
[STT] CaptainKidAk869: ...transcript...
```

## v1.3 — Free Hosted STT with Vosk Local

This build adds `STT_MODE=vosk-local`, which lets the SkyEcho hosted backend transcribe Discord pilot audio locally without OpenAI STT credits.

### Install Vosk Python package

```bash
cd ~/Desktop/skyecho-atc-discord-bridge-v1.3-vosk-local-stt
python3 -m pip install vosk
```

### Download the default English Vosk model

```bash
npm run download:vosk-model
```

Expected model folder:

```text
./models/vosk-model-small-en-us-0.15
```

### .env STT section

```env
STT_MODE=vosk-local
VOSK_MODEL_PATH=./models/vosk-model-small-en-us-0.15
PYTHON_BIN=python3
VOSK_TIMEOUT_MS=20000
```

### Runtime terminals

Terminal 1 — TTS server:

```bash
cd ~/Desktop/skyecho-atc-discord-bridge-v1.3-vosk-local-stt
npm run piper
```

Terminal 2 — SkyEcho hosted backend and Discord bot:

```bash
cd ~/Desktop/skyecho-atc-discord-bridge-v1.3-vosk-local-stt
npm start
```

### Discord test

```text
/join
/start_atc callsign:LIAT319 route:TKPK SKB G633 ANU DCT TAPA cruise:FL310
/stt_status
```

Then unmute in Discord, say the clearance request, and mute again. The server will record the audio, run Vosk locally, send the transcript into SkyEcho ATC logic, and speak the answer back through Discord.
