import 'dotenv/config';
import http from 'http';
import fs from 'fs/promises';
import fsSync from 'fs';
import os from 'os';
import path from 'path';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Render provides PORT. Locally, fall back to PIPER_HTTP_PORT or 10000.
const PORT = Number(process.env.PORT || process.env.PIPER_HTTP_PORT || 10000);

// Render must bind to 0.0.0.0, not 127.0.0.1.
const HOST = process.env.PIPER_HTTP_HOST || '0.0.0.0';

const PIPER_BINARY = process.env.PIPER_BINARY || 'python3';
const ATC_MODEL = process.env.PIPER_MODEL_ATC || process.env.PIPER_MODEL || '';
const TRAFFIC_MODEL = process.env.PIPER_MODEL_TRAFFIC || process.env.PIPER_MODEL || ATC_MODEL;

// On Render this should stay false, but it is harmless if false.
const MAC_SAY_FALLBACK =
  String(process.env.PIPER_MAC_SAY_FALLBACK || 'false').toLowerCase() !== 'false';

function log(msg) {
  console.log(`[PiperHTTP] ${msg}`);
}

function warn(msg) {
  console.warn(`[PiperHTTP] ${msg}`);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/') {
      return json(res, 200, {
        ok: true,
        service: 'SkyEcho Piper HTTP',
        routes: ['POST /api/tts', 'POST /tts', 'GET /health'],
        piperBinary: PIPER_BINARY,
        atcModel: ATC_MODEL || null,
        trafficModel: TRAFFIC_MODEL || null,
        fallback: MAC_SAY_FALLBACK
      });
    }

    if (req.method === 'GET' && req.url === '/health') {
      return json(res, 200, {
        ok: true,
        service: 'SkyEcho Piper HTTP',
        status: 'healthy',
        routes: ['POST /api/tts', 'POST /tts'],
        piperBinary: PIPER_BINARY,
        atcModel: Boolean(ATC_MODEL),
        trafficModel: Boolean(TRAFFIC_MODEL),
        fallback: MAC_SAY_FALLBACK
      });
    }

    if (req.method === 'POST' && (req.url === '/api/tts' || req.url === '/tts')) {
      const body = await readJson(req);

      const text = sanitizeText(body.text || 'SkyEcho Piper test.');
      const role = body.role === 'traffic' || body.voice === 'traffic' ? 'traffic' : 'atc';

      const wav = await synthesizeToWav(text, role);

      res.writeHead(200, {
        'content-type': 'audio/wav',
        'content-length': wav.length,
        'cache-control': 'no-store'
      });

      return res.end(wav);
    }

    return json(res, 404, {
      ok: false,
      error: 'Not found. Use POST /api/tts or POST /tts with { text, role }.',
      routes: ['POST /api/tts', 'POST /tts', 'GET /health']
    });
  } catch (err) {
    warn(err.stack || err.message);
    return json(res, 500, {
      ok: false,
      error: err.message || 'Piper TTS failed'
    });
  }
});

server.listen(PORT, HOST, () => {
  log(`listening at http://${HOST}:${PORT}`);
  log('POST /api/tts');
  log('POST /tts');
  log(`ATC model: ${ATC_MODEL || 'undefined'}`);
  log(`Traffic model: ${TRAFFIC_MODEL || 'undefined'}`);

  if (!ATC_MODEL) {
    warn('No PIPER_MODEL_ATC/PIPER_MODEL set.');
  }
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

    throw new Error(
      `No Piper model found for role "${role}". Set PIPER_MODEL_ATC/PIPER_MODEL_TRAFFIC to valid .onnx paths. Current model path: ${model || 'empty'}`
    );
  } finally {
    fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

function runPiper(text, model, outputFile) {
  return new Promise((resolve, reject) => {
    let command;
    let args;

    if (PIPER_BINARY === 'python3' || PIPER_BINARY === 'python' || PIPER_BINARY.includes('python')) {
      command = PIPER_BINARY;
      args = ['-m', 'piper', '--model', model, '--output_file', outputFile];
    } else {
      command = PIPER_BINARY;
      args = ['--model', model, '--output_file', outputFile];
    }

    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env
    });

    let stderr = '';

    child.stderr.on('data', d => {
      stderr += d.toString();
    });

    child.on('error', err => {
      reject(err);
    });

    child.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`piper exited with code ${code}: ${stderr.trim()}`));
      }
    });

    child.stdin.write(text + '\n');
    child.stdin.end();
  });
}

async function runMacSay(text, outputFile, role) {
  const tmpAiff = outputFile.replace(/\.wav$/i, '.aiff');

  const voice =
    role === 'traffic'
      ? process.env.MAC_SAY_VOICE_TRAFFIC || 'Daniel'
      : process.env.MAC_SAY_VOICE_ATC || 'Alex';

  await execFileAsync('say', ['-v', voice, '-o', tmpAiff, text]);

  let ffmpeg = 'ffmpeg';

  try {
    const mod = await import('ffmpeg-static');
    if (mod.default) ffmpeg = mod.default;
  } catch {
    // Use system ffmpeg.
  }

  await execFileAsync(ffmpeg, ['-y', '-i', tmpAiff, '-ar', '48000', '-ac', '2', outputFile]);
}

function sanitizeText(text) {
  return String(text)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';

    req.on('data', chunk => {
      data += chunk;

      if (data.length > 100000) {
        reject(new Error('Request too large'));
      }
    });

    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });

    req.on('error', reject);
  });
}

function json(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload, null, 2));

  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': body.length
  });

  res.end(body);
}
