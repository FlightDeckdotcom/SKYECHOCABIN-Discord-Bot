// src/utils/radioFx.js
import fs from 'fs';
import path from 'path';

const AUDIO_DIR = path.resolve('public', 'audio');
const KEY_FILE = path.join(AUDIO_DIR, 'skyecho-radio-key.wav');
const TAIL_FILE = path.join(AUDIO_DIR, 'skyecho-radio-tail.wav');

export function ensureRadioFxFiles() {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  if (!fs.existsSync(KEY_FILE)) fs.writeFileSync(KEY_FILE, createRadioBurstWav({ ms: 90, toneHz: 1250, noise: 0.20, gain: 0.25 }));
  if (!fs.existsSync(TAIL_FILE)) fs.writeFileSync(TAIL_FILE, createRadioBurstWav({ ms: 130, toneHz: 650, noise: 0.35, gain: 0.18, tail: true }));
  return { key: KEY_FILE, tail: TAIL_FILE };
}

export function getRadioFxPath(kind = 'key') {
  ensureRadioFxFiles();
  return kind === 'tail' ? TAIL_FILE : KEY_FILE;
}

function createRadioBurstWav({ ms = 100, sampleRate = 48000, toneHz = 1000, noise = 0.25, gain = 0.2, tail = false } = {}) {
  const samples = Math.floor(sampleRate * (ms / 1000));
  const pcm = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const fadeIn = Math.min(1, i / Math.max(1, samples * 0.12));
    const fadeOut = Math.min(1, (samples - i) / Math.max(1, samples * 0.35));
    const env = fadeIn * fadeOut;
    const tone = Math.sin(2 * Math.PI * toneHz * t) * (tail ? 0.35 : 0.6);
    const hiss = (Math.random() * 2 - 1) * noise;
    const crackle = (Math.random() > 0.985 ? (Math.random() * 2 - 1) * 0.8 : 0);
    let sample = (tone + hiss + crackle) * gain * env;
    sample = Math.max(-1, Math.min(1, sample));
    pcm.writeInt16LE(Math.floor(sample * 32767), i * 2);
  }
  return wrapPcmAsWav(pcm, sampleRate, 1);
}

function wrapPcmAsWav(pcmBuffer, sampleRate = 48000, channels = 1) {
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  const dataSize = pcmBuffer.length;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcmBuffer.copy(buffer, 44);
  return buffer;
}
