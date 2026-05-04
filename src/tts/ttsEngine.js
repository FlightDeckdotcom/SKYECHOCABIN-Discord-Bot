const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');

const tmpDir = path.join(process.cwd(), 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

async function synthesizeSpeech(text) {
  const mode = (process.env.TTS_MODE || 'none').toLowerCase();
  if (mode === 'elevenlabs') return synthesizeElevenLabs(text);
  if (mode === 'piper_http') return synthesizePiperHttp(text);
  if (mode === 'system_say') return synthesizeSystemSay(text);
  console.log('[TTS disabled]', text);
  return null;
}

async function synthesizeElevenLabs(text) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_flash_v2_5';
  if (!apiKey || !voiceId) throw new Error('ElevenLabs API key or voice ID missing.');
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: modelId, voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true } })
  });
  if (!res.ok) throw new Error(`ElevenLabs TTS failed: ${res.status} ${await res.text()}`);
  const buffer = await res.buffer();
  const out = path.join(tmpDir, `${uuidv4()}.mp3`);
  fs.writeFileSync(out, buffer);
  return out;
}

async function synthesizePiperHttp(text) {
  const url = process.env.PIPER_HTTP_URL;
  if (!url) throw new Error('PIPER_HTTP_URL missing.');
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  if (!res.ok) throw new Error(`Piper HTTP failed: ${res.status} ${await res.text()}`);
  const buffer = await res.buffer();
  const out = path.join(tmpDir, `${uuidv4()}.wav`);
  fs.writeFileSync(out, buffer);
  return out;
}

function synthesizeSystemSay(text) {
  return new Promise((resolve, reject) => {
    const out = path.join(tmpDir, `${uuidv4()}.aiff`);
    const child = spawn('say', ['-o', out, text]);
    child.on('close', code => code === 0 ? resolve(out) : reject(new Error(`macOS say failed with code ${code}`)));
  });
}

module.exports = { synthesizeSpeech };
