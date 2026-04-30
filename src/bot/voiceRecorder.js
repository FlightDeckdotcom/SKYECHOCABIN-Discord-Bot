import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import prism from 'prism-media';
import { EndBehaviorType } from '@discordjs/voice';
import { log, warn } from '../utils/logger.js';

const active = new Map();

export function startPilotRecording({ guildId, connection, userId, displayName }) {
  if (!connection?.receiver) return { ok: false, reason: 'no_receiver' };
  const key = `${guildId}:${userId}`;
  if (active.has(key)) return { ok: true, already: true };

  const dir = path.join(process.cwd(), 'recordings');
  fs.mkdirSync(dir, { recursive: true });
  const startedAt = Date.now();
  const baseName = `${guildId}_${userId}_${startedAt}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const pcmPath = path.join(dir, `${baseName}.pcm`);
  const wavPath = path.join(dir, `${baseName}.wav`);
  const pcmFile = fs.createWriteStream(pcmPath);

  const opus = connection.receiver.subscribe(userId, {
    end: { behavior: EndBehaviorType.Manual }
  });
  const decoder = new prism.opus.Decoder({ frameSize: 960, channels: 2, rate: 48000 });

  let bytes = 0;
  let stopped = false;

  decoder.on('data', chunk => { bytes += chunk.length; });
  opus.on('error', err => warn('VoiceRX', `Opus receive error: ${err.message}`));
  decoder.on('error', err => warn('VoiceRX', `Decoder error: ${err.message}`));
  pcmFile.on('error', err => warn('VoiceRX', `PCM write error: ${err.message}`));

  opus.pipe(decoder).pipe(pcmFile);

  active.set(key, { opus, decoder, pcmFile, pcmPath, wavPath, bytes: () => bytes, startedAt, displayName, userId, guildId, stopped });
  log('VoiceRX', `Recording started for ${displayName || userId}`);
  return { ok: true, pcmPath, wavPath };
}

export async function stopPilotRecording({ guildId, userId }) {
  const key = `${guildId}:${userId}`;
  const rec = active.get(key);
  if (!rec) return { ok: false, reason: 'not_recording' };
  active.delete(key);

  try { rec.opus.destroy(); } catch {}
  try { rec.decoder.end(); } catch {}
  try { rec.pcmFile.end(); } catch {}

  await wait(300);
  const durationMs = Date.now() - rec.startedAt;
  const bytes = rec.bytes();

  if (durationMs < Number(process.env.MIN_PTT_MS || 700) || bytes < Number(process.env.MIN_AUDIO_BYTES || 12000)) {
    await safeUnlink(rec.pcmPath);
    return { ok: false, reason: 'too_short', durationMs, bytes };
  }

  await pcmToWav(rec.pcmPath, rec.wavPath, { channels: 2, sampleRate: 48000, bitDepth: 16 });
  if (process.env.KEEP_PCM !== 'true') await safeUnlink(rec.pcmPath);
  log('VoiceRX', `Recording saved ${path.basename(rec.wavPath)} (${durationMs}ms, ${bytes} pcm bytes)`);
  return { ok: true, wavPath: rec.wavPath, durationMs, bytes, displayName: rec.displayName, userId: rec.userId };
}

async function pcmToWav(pcmPath, wavPath, opts) {
  const pcm = await fsp.readFile(pcmPath);
  const header = wavHeader(pcm.length, opts);
  await fsp.writeFile(wavPath, Buffer.concat([header, pcm]));
}

function wavHeader(dataLength, { channels, sampleRate, bitDepth }) {
  const blockAlign = channels * bitDepth / 8;
  const byteRate = sampleRate * blockAlign;
  const buffer = Buffer.alloc(44);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitDepth, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);
  return buffer;
}

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function safeUnlink(file) { try { await fsp.unlink(file); } catch {} }
