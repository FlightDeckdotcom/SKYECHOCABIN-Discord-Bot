import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { log, warn } from '../utils/logger.js';

const cacheDir = path.resolve('public/audio-cache');

export async function synthesizeSpeech({ text, role = 'atc' }) {
  await fs.mkdir(cacheDir, { recursive: true });
  const mode = process.env.TTS_MODE || 'mock';
  if (mode === 'piper-http') return piperHttp(text, role);
  if (mode === 'elevenlabs') return elevenLabs(text, role);
  return mockAudio(text, role);
}

async function mockAudio(text, role) {
  const filename = `mock-${role}-${hash(text)}.txt`;
  const filepath = path.join(cacheDir, filename);
  await fs.writeFile(filepath, text, 'utf8');
  return { mode: 'mock', url: `/audio-cache/${filename}`, text, playable: false };
}

async function piperHttp(text, role) {
  const url = process.env.PIPER_TTS_URL;
  if (!url) return mockAudio(text, role);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.TTS_TIMEOUT_MS || 15000));
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'audio/wav, audio/*' },
      body: JSON.stringify({ text, role, format: 'wav', sampleRate: 48000 }),
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));
    if (!res.ok) throw new Error(`Piper HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const filename = `piper-${role}-${hash(text)}.wav`;
    await fs.writeFile(path.join(cacheDir, filename), buf);
    return { mode: 'piper-http', url: `/audio-cache/${filename}`, text, playable: true };
  } catch (e) {
    warn('TTS', `Piper failed, using mock: ${e.message}`);
    return mockAudio(text, role);
  }
}

async function elevenLabs(text, role) {
  const key = process.env.ELEVENLABS_API_KEY;
  const voice = role === 'traffic' ? process.env.ELEVENLABS_VOICE_TRAFFIC : process.env.ELEVENLABS_VOICE_ATC;
  if (!key || !voice) return mockAudio(text, role);
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5', voice_settings: { stability: 0.55, similarity_boost: 0.75 } })
    });
    if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const filename = `el-${role}-${hash(text)}.mp3`;
    await fs.writeFile(path.join(cacheDir, filename), buf);
    return { mode: 'elevenlabs', url: `/audio-cache/${filename}`, text, playable: true };
  } catch (e) {
    warn('TTS', `ElevenLabs failed, using mock: ${e.message}`);
    return mockAudio(text, role);
  }
}

function hash(text) { return crypto.createHash('sha1').update(text).digest('hex').slice(0, 16); }
