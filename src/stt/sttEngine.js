import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { log, warn } from '../utils/logger.js';

export async function transcribeManual(text) {
  return { text: String(text || '').trim(), confidence: 1, mode: 'manual' };
}

export async function transcribeAudioFile(filePath, meta = {}) {
  const mode = (process.env.STT_MODE || 'manual').toLowerCase();

  if (mode === 'manual') {
    return {
      text: '', confidence: 0, mode, skipped: true,
      reason: 'STT_MODE=manual. Use /pilot text or set STT_MODE=vosk-local/openai-whisper for Discord voice transcription.'
    };
  }

  if (mode === 'mock') {
    return {
      text: process.env.STT_MOCK_TEXT || 'Clearance, LIAT 319, request IFR clearance to TAPA.',
      confidence: 0.5, mode, mock: true
    };
  }

  if (mode === 'vosk-local' || mode === 'vosk') return transcribeVoskLocal(filePath, meta);
  if (mode === 'openai-whisper' || mode === 'openai') return transcribeOpenAI(filePath, meta);

  return { text: '', confidence: 0, mode, skipped: true, reason: `Unknown STT_MODE=${mode}` };
}

async function transcribeVoskLocal(filePath, meta = {}) {
  const modelPath = process.env.VOSK_MODEL_PATH || './models/vosk-model-small-en-us-0.15';
  const pythonBin = process.env.PYTHON_BIN || 'python3';
  const scriptPath = path.join(process.cwd(), 'scripts', 'vosk-transcribe.py');
  const timeoutMs = Number(process.env.VOSK_TIMEOUT_MS || 20000);
  log('STT', `Running local Vosk STT for ${path.basename(filePath)} (${meta.displayName || meta.userId || 'pilot'})`);

  const result = await runProcess(pythonBin, [scriptPath, filePath, modelPath], timeoutMs);
  if (result.code !== 0) {
    warn('STT', `Vosk failed ${result.code}: ${result.stderr || result.stdout}`);
    return { text: '', confidence: 0, mode: 'vosk-local', error: `Vosk failed ${result.code}`, detail: String(result.stderr || result.stdout || '').slice(0, 700) };
  }
  let json;
  try { json = JSON.parse(result.stdout || '{}'); }
  catch { return { text: '', confidence: 0, mode: 'vosk-local', error: 'Vosk returned non-JSON output.', detail: String(result.stdout || result.stderr || '').slice(0, 700) }; }
  const rawText = String(json.text || '').trim();
  const text = normalizeAtcTranscript(rawText);
  return { text, confidence: Number(json.confidence || (text ? 0.72 : 0)), mode: 'vosk-local', raw: json };
}

async function transcribeOpenAI(filePath, meta = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { text: '', confidence: 0, mode: 'openai-whisper', skipped: true, reason: 'OPENAI_API_KEY is missing.' };
  const model = process.env.OPENAI_STT_MODEL || 'whisper-1';
  const audio = await fs.readFile(filePath);
  const form = new FormData();
  form.append('model', model);
  form.append('file', new Blob([audio], { type: 'audio/wav' }), path.basename(filePath));
  form.append('language', process.env.STT_LANGUAGE || 'en');
  form.append('response_format', 'json');
  log('STT', `Sending ${path.basename(filePath)} to OpenAI STT model ${model} (${meta.displayName || meta.userId || 'pilot'})`);
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form });
  if (!res.ok) {
    const body = await res.text();
    warn('STT', `OpenAI STT failed ${res.status}: ${body}`);
    return { text: '', confidence: 0, mode: 'openai-whisper', error: `OpenAI STT failed ${res.status}`, detail: body.slice(0, 500) };
  }
  const json = await res.json();
  return { text: String(json.text || '').trim(), confidence: 0.9, mode: 'openai-whisper', raw: json };
}

function runProcess(command, args, timeoutMs) {
  return new Promise(resolve => {
    const child = spawn(command, args, { cwd: process.cwd(), env: process.env });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {}; resolve({ code: 124, stdout, stderr: stderr + '\nTimed out.' }); }, timeoutMs);
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('error', err => { clearTimeout(timer); resolve({ code: 127, stdout, stderr: err.message }); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

function normalizeAtcTranscript(text) {
  if (!text) return '';
  let t = text
    .replace(/\bif are\b/gi, 'IFR')
    .replace(/\bi f r\b/gi, 'IFR')
    .replace(/\bclear ants\b/gi, 'clearance')
    .replace(/\blee at\b/gi, 'LIAT')
    .replace(/\blead\b/gi, 'LIAT')
    .replace(/\bthree nineteen\b/gi, '319')
    .replace(/\bthree one nine\b/gi, '319')
    .replace(/\btapper\b/gi, 'TAPA')
    .replace(/\btapa\b/gi, 'TAPA')
    .replace(/\btkpk\b/gi, 'TKPK')
    .replace(/\bskb\b/gi, 'SKB')
    .replace(/\banu\b/gi, 'ANU')
    .replace(/\s+/g, ' ')
    .trim();
  if (t && !/[.!?]$/.test(t)) t += '.';
  return t;
}
