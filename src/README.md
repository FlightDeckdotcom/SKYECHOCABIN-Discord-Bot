# SkyEcho Discord Bot v2.1

GitHub-ready Discord ATC bot folder with a widened ATC intent resolver for bad Vosk/STT output.

This version fixes the loop where the bot keeps saying `say again request` after radar contact. The ATC engine now uses:

1. STT normalization
2. Loose ATC phrase matching
3. Current flight phase/state
4. Last ATC instruction context
5. A fallback that asks for altitude/heading/route/request instead of endlessly saying only `say again request`

## Main files

```txt
src/index.js                    Discord command entry point
src/discord/voiceManager.js      Discord voice/TTS bridge and transcript handler
src/atc/intentResolver.js        Widened Vosk/STT intent resolver
src/atc/responseEngine.js        ATC response builder
src/atc/sessionStore.js          Per-guild ATC state/session memory
src/stt/atcGrammar.js            Expanded ATC phrase bank for Vosk grammar
src/tts/ttsEngine.js             TTS options: ElevenLabs, Piper HTTP, macOS say, or none
src/testIntents.js               Local test script
```

## Install

```bash
npm install
cp .env.example .env
```

Fill in:

```env
DISCORD_TOKEN=your_token_here
```

Then run:

```bash
npm start
```

## Test the widened ATC brain first

Before connecting full Discord voice receive, run:

```bash
npm run test:intents
```

You should see messy phrases like:

```txt
maintain in flight label tree for zero
```

resolve as altitude/flight-level reports instead of unknown requests.

## Discord commands

```txt
!sky join
!sky say <pilot phrase>
!sky atc <raw ATC line>
!sky callsign <callsign>
!sky phase departure|enroute|descent|approach|tower
!sky session
!sky reset
```

Example:

```txt
!sky say maintaining flight label tree for zero
```

Expected behavior:

```txt
SkyEcho Seven Three Eight, roger, maintain FL340.
```

## TTS modes

By default:

```env
TTS_MODE=none
```

This logs ATC replies without speaking. To speak through Discord voice, use one of these:

### ElevenLabs

```env
TTS_MODE=elevenlabs
ELEVENLABS_API_KEY=your_key
ELEVENLABS_VOICE_ID=your_voice_id
ELEVENLABS_MODEL_ID=eleven_flash_v2_5
```

### Piper HTTP

```env
TTS_MODE=piper_http
PIPER_HTTP_URL=http://127.0.0.1:5002/synthesize
```

This assumes you have a working Piper HTTP service. This folder does **not** require the broken `piper` executable path.

### macOS say

```env
TTS_MODE=system_say
```

Useful for local Mac testing only.

## Where your existing Vosk live audio should connect

Your live Vosk output should call this function:

```js
const { handleTranscript } = require('./src/discord/voiceManager');
await handleTranscript(guildId, voskTranscript);
```

That is the corrected flow:

```txt
Vosk raw text → intentResolver → responseEngine → TTS/Discord voice
```

Do **not** directly send unrecognized phrases to `say again request` anymore.

## Important change from older bot

Old strict behavior:

```txt
Bad STT → unknown → say again request
```

New behavior:

```txt
Bad STT → normalize → context match → best ATC intent → useful response
```

After radar contact, the session stays open:

```js
expectedPilotAction: 'open_request'
```

That allows the pilot to say:

```txt
proceeding on course
maintaining flight level three four zero
request higher
request lower
request descent
request vectors
request direct
traffic in sight
negative contact
say again
```

without getting stuck in the loop.
