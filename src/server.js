import 'dotenv/config';
import express from 'express';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';

const app = express();
app.use(express.json({ limit: '2mb' }));

function runPiper(text, model) {
  return new Promise((resolve, reject) => {
    const out = `/tmp/piper-${randomUUID()}.wav`;

    const bin = process.env.PIPER_BINARY || 'python3';

    const args = bin.includes('python')
      ? ['-m', 'piper', '--model', model, '--output_file', out]
      : ['--model', model, '--output_file', out];

    const p = spawn(bin, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env
    });

    let err = '';

    p.stderr.on('data', d => {
      err += d.toString();
    });

    p.on('close', async code => {
      if (code !== 0) {
        return reject(new Error(err || `piper exited ${code}`));
      }

      try {
        const audio = await fs.readFile(out);
        resolve(audio);
      } catch (readErr) {
        reject(readErr);
      }
    });

    p.stdin.write(text || 'SkyEcho radio check.');
    p.stdin.end();
  });
}

async function handleTts(req, res) {
  try {
    const { text, voice, role } = req.body || {};
    const selectedRole = voice || role || 'atc';

    const model =
      selectedRole === 'traffic'
        ? process.env.PIPER_MODEL_TRAFFIC || process.env.PIPER_MODEL
        : process.env.PIPER_MODEL_ATC || process.env.PIPER_MODEL;

    if (!model) {
      throw new Error('No PIPER_MODEL_ATC/PIPER_MODEL configured');
    }

    const audio = await runPiper(text || 'SkyEcho test.', model);

    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Cache-Control', 'no-store');
    res.send(audio);
  } catch (e) {
    console.error('[PiperHTTP]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
}

app.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'SkyEcho Piper Backend',
    routes: ['/api/tts', '/tts', '/health'],
    voices: {
      atc: process.env.PIPER_MODEL_ATC || process.env.PIPER_MODEL || null,
      traffic: process.env.PIPER_MODEL_TRAFFIC || process.env.PIPER_MODEL || null
    }
  });
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'SkyEcho Piper Backend',
    status: 'healthy'
  });
});

app.post('/api/tts', handleTts);
app.post('/tts', handleTts);

const host = '0.0.0.0';
const port = Number(process.env.PORT || process.env.PIPER_HTTP_PORT || 10000);

app.listen(port, host, () => {
  console.log(`[PiperHTTP] listening at http://${host}:${port}`);
  console.log(`[PiperHTTP] POST /api/tts`);
  console.log(`[PiperHTTP] POST /tts`);
  console.log(`[PiperHTTP] ATC model: ${process.env.PIPER_MODEL_ATC || process.env.PIPER_MODEL}`);
  console.log(`[PiperHTTP] Traffic model: ${process.env.PIPER_MODEL_TRAFFIC || process.env.PIPER_MODEL}`);
});
