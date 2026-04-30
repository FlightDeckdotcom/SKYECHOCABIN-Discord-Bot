import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { createSession, getSession, listSessions, deleteSession } from './atc/sessionStore.js';
import { handlePilotText } from './atc/atcEngine.js';
import { seedTraffic, nextTrafficTransmission } from './traffic/syntheticTraffic.js';
import { synthesizeSpeech } from './tts/ttsEngine.js';
import { startDiscordBot, speakToGuild } from './bot/discordBot.js';
import { log } from './utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 8787);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.resolve('public')));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'SkyEcho ATC Discord Bridge', tts: process.env.TTS_MODE || 'mock' }));

app.post('/api/session', (req, res) => {
  const session = createSession(req.body || {});
  seedTraffic(session, req.body?.trafficDensity || 'medium');
  broadcast({ type: 'session_created', session });
  res.json(session);
});

app.get('/api/sessions', (req, res) => res.json(listSessions()));
app.get('/api/session/:id', (req, res) => {
  const s = getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  res.json(s);
});
app.delete('/api/session/:id', (req, res) => res.json({ ok: deleteSession(req.params.id) }));

app.post('/api/session/:id/pilot-text', async (req, res) => {
  const s = getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  const result = handlePilotText(s, req.body?.text || '');
  const audio = await synthesizeSpeech({ text: result.text, role: 'atc' });
  broadcast({ type: 'atc', sessionId: s.id, result, audio });
  res.json({ result, audio });
});

app.post('/api/session/:id/traffic', async (req, res) => {
  const s = getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  const result = nextTrafficTransmission(s);
  const audio = await synthesizeSpeech({ text: result.text, role: 'traffic' });
  broadcast({ type: 'traffic', sessionId: s.id, result, audio });
  res.json({ result, audio });
});

app.post('/api/session/:id/discord-speak', async (req, res) => {
  const s = getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  const guildId = req.body?.guildId || s.discordGuildId || s.guildId;
  const text = req.body?.text || s.lastAtcText;
  const role = req.body?.role || 'atc';
  const result = await speakToGuild(guildId, text, role);
  res.json(result);
});

app.get('*', (req, res) => res.sendFile(path.resolve('public/index.html')));

const server = app.listen(port, () => log('Server', `http://localhost:${port}`));
const wss = new WebSocketServer({ server });
const sockets = new Set();
wss.on('connection', ws => { sockets.add(ws); ws.on('close', () => sockets.delete(ws)); });
function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const ws of sockets) if (ws.readyState === 1) ws.send(msg);
}

startDiscordBot();
