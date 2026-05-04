const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');

const tmpDir = path.join(process.cwd(), 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

function cleanMode(value, fallback = 'none') {
  return String(value || fallback).trim().toLowerCase();
}

function getModeForRole(role = 'atc') {
  if (role === 'traffic') return cleanMode(process.env.TRAFFIC_TTS_MODE, process.env.TTS_MODE || 'discord');
  if (role === 'cabin') return cleanMode(process.env.CABIN_TTS_MODE, process.env.TTS_MODE || 'piper');
  return cleanMode(process.env.ATC_TTS_MODE, process.env.TTS_MODE || 'piper');
}

async function synthesizeSpeech(text, role = 'atc') {
  const mode = getModeForRole(role);
  console.log(`[TTS] role=${role} mode=${mode}`);

  if (['none', 'off', 'false', 'disabled'].includes(mode)) {
    console.log('[TTS disabled]', text);
    return null;
  }

  if (mode === 'elevenlabs') return synthesizeElevenLabs(text);

  // piper = local Piper CLI using downloaded .onnx model.
  if (mode === 'piper' || mode === 'local_piper') return synthesizePiperLocal(text, role);

  // piper_http = separate Piper HTTP server.
  if (mode === 'piper_http' || mode === 'skypiper') return synthesizePiperHttp(text);

  // discord/default traffic voice: for now map to local Piper unless a custom traffic system is added.
  if (mode === 'discord' || mode === 'default' || mode === 'bot') return synthesizePiperLocal(text, 'traffic');

  if (mode === 'system_say') return synthesizeSystemSay(text);

  console.log(`[TTS unknown mode '${mode}', falling back to Piper local]`, text);
  return synthesizePiperLocal(text, role);
}

function getPiperModelForRole(role) {
  const envSpecific = role === 'traffic'
    ? process.env.TRAFFIC_PIPER_MODEL
    : role === 'cabin'
      ? process.env.CABIN_PIPER_MODEL
      : process.env.ATC_PIPER_MODEL;

  return envSpecific
    || process.env.PIPER_MODEL
    || path.join(process.cwd(), 'models', 'piper', 'en_US-lessac-high.onnx');
}

async function synthesizePiperLocal(text, role = 'atc') {
  const modelPath = getPiperModelForRole(role);
  const outputPath = path.join(tmpDir, `${uuidv4()}.wav`);
  const piperCommand = process.env.PIPER_BIN || 'piper';

  if (!fs.existsSync(modelPath)) {
    throw new Error(`Piper model missing: ${modelPath}. Run npm run download:piper-voice or set PIPER_MODEL to a valid .onnx file.`);
  }

  console.log(`[PIPER] generating role=${role} model=${modelPath}`);

  await new Promise((resolve, reject) => {
    const child = spawn(piperCommand, ['--model', modelPath, '--output_file', outputPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stderr = '';
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0 && fs.existsSync(outputPath)) return resolve();
      reject(new Error(`Piper failed with code ${code}. ${stderr}`));
    });

    child.stdin.write(text);
    child.stdin.end();
  });

  return outputPath;
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
  if (!url) throw new Error('PIPER_HTTP_URL missing. Use TTS_MODE=piper for local Piper, or provide PIPER_HTTP_URL for piper_http mode.');
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

module.exports = { synthesizeSpeech, getModeForRole };
