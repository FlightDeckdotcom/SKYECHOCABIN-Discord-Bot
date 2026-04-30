import 'dotenv/config';
import http from 'http';
import fs from 'fs/promises';
import fsSync from 'fs';
import os from 'os';
import path from 'path';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const PORT = Number(process.env.PIPER_HTTP_PORT || 5000);
const HOST = process.env.PIPER_HTTP_HOST || '127.0.0.1';
const PIPER_BINARY = process.env.PIPER_BINARY || 'piper';
const ATC_MODEL = process.env.PIPER_MODEL_ATC || process.env.PIPER_MODEL || '';
const TRAFFIC_MODEL = process.env.PIPER_MODEL_TRAFFIC || process.env.PIPER_MODEL || ATC_MODEL;
const MAC_SAY_FALLBACK = String(process.env.PIPER_MAC_SAY_FALLBACK || 'true').toLowerCase() !== 'false';

function log(msg) { console.log(`[PiperHTTP] ${msg}`); }
function warn(msg) { console.warn(`[PiperHTTP] ${msg}`); }

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      return json(res, 200, { ok: true, service: 'SkyEcho Piper HTTP', piperBinary: PIPER_BINARY, atcModel: !!ATC_MODEL, trafficModel: !!TRAFFIC_MODEL, fallback: MAC_SAY_FALLBACK });
    }
    if (req.method === 'POST' && (req.url === '/api/tts' || req.url === '/tts')) {
      const body = await readJson(req);
      const text = sanitizeText(body.text || 'SkyEcho Piper test.');
      const role = body.role === 'traffic' ? 'traffic' : 'atc';
      const wav = await synthesizeToWav(text, role);
      res.writeHead(200, { 'content-type': 'audio/wav', 'content-length': wav.length, 'cache-control': 'no-store' });
      return res.end(wav);
    }
    json(res, 404, { ok: false, error: 'Not found. Use POST /api/tts with { text, role }.' });
  } catch (err) {
    warn(err.stack || err.message);
    json(res, 500, { ok: false, error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  log(`listening at http://${HOST}:${PORT}/api/tts`);
  if (!ATC_MODEL) warn('No PIPER_MODEL_ATC/PIPER_MODEL set. macOS say fallback will be used if available.');
});

async function synthesizeToWav(text, role) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'skyecho-piper-'));
  const outWav = path.join(tmp, `${role}-${Date.now()}.wav`);
  const model = role === 'traffic' ? TRAFFIC_MODEL : ATC_MODEL;
  try {
    if (model && fsSync.existsSync(model)) {
      await runPiper(text, model, outWav);
      return await fs.readFile(outWav);
    }
    if (MAC_SAY_FALLBACK && process.platform === 'darwin') {
      await runMacSay(text, outWav, role);
      return await fs.readFile(outWav);
    }
    throw new Error('No Piper model found and no usable fallback. Set PIPER_MODEL_ATC to a .onnx model path.');
  } finally {
    fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

function runPiper(text, model, outputFile) {
  return new Promise((resolve, reject) => {
    const child = spawn(PIPER_BINARY, ['--model', model, '--output_file', outputFile], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`piper exited with code ${code}: ${stderr.trim()}`)));
    child.stdin.write(text + '\n');
    child.stdin.end();
  });
}

async function runMacSay(text, outputFile, role) {
  const tmpAiff = outputFile.replace(/\.wav$/i, '.aiff');
  const voice = role === 'traffic' ? (process.env.MAC_SAY_VOICE_TRAFFIC || 'Daniel') : (process.env.MAC_SAY_VOICE_ATC || 'Alex');
  await execFileAsync('say', ['-v', voice, '-o', tmpAiff, text]);
  let ffmpeg = 'ffmpeg';
  try { const mod = await import('ffmpeg-static'); if (mod.default) ffmpeg = mod.default; } catch {}
  await execFileAsync(ffmpeg, ['-y', '-i', tmpAiff, '-ar', '48000', '-ac', '2', outputFile]);
}

function sanitizeText(text) { return String(text).replace(/\s+/g, ' ').trim().slice(0, 1200); }
function readJson(req) { return new Promise((resolve, reject) => { let data=''; req.on('data', c => { data += c; if (data.length > 100000) reject(new Error('Request too large')); }); req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Invalid JSON')); } }); req.on('error', reject); }); }
function json(res, status, payload) { const body=Buffer.from(JSON.stringify(payload,null,2)); res.writeHead(status, {'content-type':'application/json','content-length':body.length}); res.end(body); }
