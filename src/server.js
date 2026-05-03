import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

import { createSession, getSession, listSessions, deleteSession } from './atc/sessionStore.js';
import { handlePilotText } from './atc/atcEngine.js';
import { seedTraffic, nextTrafficTransmission } from './traffic/syntheticTraffic.js';
import { synthesizeSpeech } from './tts/ttsEngine.js';
import { startDiscordBot, speakToGuild } from './bot/discordBot.js';
import { log } from './utils/logger.js';

import { saveDiscordSync, listPendingSyncs } from './discord/discordSyncStore.js';

import {
  loadNavData,
  getNavDataStatus,
  getAirportBundle,
  getTaxiInstructionFromCsv
} from './nav/navDataStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 8787);

const publicDir = path.resolve('public');
const indexPath = path.join(publicDir, 'index.html');

let navDataBootStarted = false;
let navDataBootLoaded = false;
let navDataBootError = null;

function startDelayedNavDataLoad() {
  if (navDataBootStarted) return;

  navDataBootStarted = true;

  setTimeout(() => {
    try {
      log('NavData', 'Starting delayed CSV load after server boot...');
      loadNavData();
      navDataBootLoaded = true;
      navDataBootError = null;
      log('NavData', 'CSV load completed.');
    } catch (err) {
      navDataBootLoaded = false;
      navDataBootError = err?.message || String(err);
      console.error('[NavData] Delayed load failed:', err?.stack || err?.message || err);
    }
  }, 2500);
}

/**
 * CORS must come BEFORE routes.
 * This fixes the web app Sync With Discord button:
 * OPTIONS /api/discord/sync 200
 * then POST /api/discord/sync 200
 */
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(200).send('ok');
  }

  next();
});

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false
}));

app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

/**
 * Render/root health routes
 */
app.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'SkyEcho ATC Discord Bot',
    status: 'running',
    discord: process.env.DISCORD_TOKEN ? 'configured' : 'missing_token',
    ttsMode: process.env.TTS_MODE || 'mock',
    piperUrl: process.env.PIPER_TTS_URL || null,
    sttMode: process.env.STT_MODE || 'manual',
    discordGuildId: process.env.DISCORD_GUILD_ID || null,
    defaultVoiceChannelId: process.env.SKYECHO_DEFAULT_VOICE_CHANNEL_ID || null,
    navData: {
      delayedLoadStarted: navDataBootStarted,
      delayedLoadCompleted: navDataBootLoaded,
      delayedLoadError: navDataBootError
    },
    routes: {
      health: [
        'GET /',
        'GET /health',
        'GET /api/health'
      ],
      discordSync: [
        'POST /api/discord/sync',
        'GET /api/discord/syncs'
      ],
      navData: [
        'GET /api/nav/status',
        'GET /api/nav/airport/:icao',
        'GET /api/nav/taxi/:icao/:runway'
      ],
      sessions: [
        'POST /api/session',
        'GET /api/sessions',
        'GET /api/session/:id',
        'DELETE /api/session/:id',
        'POST /api/session/:id/pilot-text',
        'POST /api/session/:id/traffic',
        'POST /api/session/:id/discord-speak'
      ]
    }
  });
});

app.get('/health', (req, res) => {
  let navData = {
    delayedLoadStarted: navDataBootStarted,
    delayedLoadCompleted: navDataBootLoaded,
    delayedLoadError: navDataBootError
  };

  try {
    if (navDataBootLoaded) {
      navData = getNavDataStatus();
    }
  } catch (err) {
    navData = {
      ok: false,
      delayedLoadStarted: navDataBootStarted,
      delayedLoadCompleted: navDataBootLoaded,
      delayedLoadError: err?.message || String(err)
    };
  }

  res.json({
    ok: true,
    service: 'SkyEcho ATC Discord Bot',
    status: 'healthy',
    ttsMode: process.env.TTS_MODE || 'mock',
    piperUrl: process.env.PIPER_TTS_URL || null,
    sttMode: process.env.STT_MODE || 'manual',
    discordGuildId: process.env.DISCORD_GUILD_ID || null,
    defaultVoiceChannelId: process.env.SKYECHO_DEFAULT_VOICE_CHANNEL_ID || null,
    navData
  });
});

app.get('/api/health', (req, res) => {
  let navData = {
    delayedLoadStarted: navDataBootStarted,
    delayedLoadCompleted: navDataBootLoaded,
    delayedLoadError: navDataBootError
  };

  try {
    if (navDataBootLoaded) {
      navData = getNavDataStatus();
    }
  } catch (err) {
    navData = {
      ok: false,
      delayedLoadStarted: navDataBootStarted,
      delayedLoadCompleted: navDataBootLoaded,
      delayedLoadError: err?.message || String(err)
    };
  }

  res.json({
    ok: true,
    service: 'SkyEcho ATC Discord Bot',
    tts: process.env.TTS_MODE || 'mock',
    piperUrl: process.env.PIPER_TTS_URL || null,
    stt: process.env.STT_MODE || 'manual',
    discordGuildId: process.env.DISCORD_GUILD_ID || null,
    defaultVoiceChannelId: process.env.SKYECHO_DEFAULT_VOICE_CHANNEL_ID || null,
    navData
  });
});

/**
 * Nav Data Routes
 *
 * These prove the CSV files in /data are being loaded and used.
 * If the delayed loader has not completed yet, these routes will still load on demand.
 */
app.get('/api/nav/status', (req, res) => {
  try {
    const status = getNavDataStatus();

    navDataBootLoaded = true;
    navDataBootError = null;

    res.json(status);
  } catch (err) {
    navDataBootLoaded = false;
    navDataBootError = err?.message || String(err);

    res.status(500).json({
      ok: false,
      error: err?.message || 'nav status failed'
    });
  }
});

app.get('/api/nav/airport/:icao', (req, res) => {
  try {
    const bundle = getAirportBundle(req.params.icao);

    navDataBootLoaded = true;
    navDataBootError = null;

    res.json(bundle);
  } catch (err) {
    navDataBootLoaded = false;
    navDataBootError = err?.message || String(err);

    res.status(500).json({
      ok: false,
      icao: req.params.icao,
      error: err?.message || 'airport lookup failed'
    });
  }
});

app.get('/api/nav/taxi/:icao/:runway', (req, res) => {
  try {
    const taxi = getTaxiInstructionFromCsv({
      airportIcao: req.params.icao,
      runway: req.params.runway,
      parking: req.query.parking || ''
    });

    navDataBootLoaded = true;
    navDataBootError = null;

    res.json(taxi);
  } catch (err) {
    navDataBootLoaded = false;
    navDataBootError = err?.message || String(err);

    res.status(500).json({
      ok: false,
      icao: req.params.icao,
      runway: req.params.runway,
      error: err?.message || 'taxi lookup failed'
    });
  }
});

/**
 * Discord Web App Sync
 *
 * The web app should POST here when the user presses Sync With Discord.
 * The user should NOT need to type a Discord session ID.
 */
app.post('/api/discord/sync', (req, res) => {
  try {
    const payload = req.body || {};

    console.log('[DiscordSync] POST received', {
      bodyKeys: Object.keys(payload),
      callsign: payload.callsign,
      spokenCallsign: payload.spokenCallsign,
      departure: payload.departure || payload.origin,
      arrival: payload.arrival || payload.destination,
      route: payload.route,
      cruise: payload.cruise,
      aircraft: payload.aircraft,
      trafficDensity: payload.trafficDensity,
      discordGuildId: payload.discordGuildId,
      discordChannelId: payload.discordChannelId
    });

    const sync = saveDiscordSync({
      ...payload,
      discordGuildId: payload.discordGuildId || process.env.DISCORD_GUILD_ID || null,
      discordChannelId:
        payload.discordChannelId ||
        process.env.SKYECHO_DEFAULT_VOICE_CHANNEL_ID ||
        null
    });

    console.log('[DiscordSync] saved', {
      syncId: sync.syncId,
      pairingCode: sync.pairingCode,
      callsign: sync.callsign,
      spokenCallsign: sync.spokenCallsign,
      channel: sync.discordChannelId,
      guild: sync.discordGuildId,
      route: sync.route,
      cruise: sync.cruise,
      expiresAt: sync.expiresAt
    });

    res.json({
      ok: true,
      status: 'discord_synced',
      message: 'SkyEcho session synced with Discord.',
      syncId: sync.syncId,
      pairingCode: sync.pairingCode,
      discordGuildId: sync.discordGuildId,
      discordChannelId: sync.discordChannelId,
      callsign: sync.callsign,
      spokenCallsign: sync.spokenCallsign,
      departure: sync.departure,
      arrival: sync.arrival,
      route: sync.route,
      cruise: sync.cruise,
      aircraft: sync.aircraft,
      trafficDensity: sync.trafficDensity,
      expiresAt: sync.expiresAt,
      instructions: sync.discordChannelId
        ? 'Join the assigned SkyEcho Discord voice channel from Xbox.'
        : `Join Discord voice and say: SkyEcho sync code ${sync.pairingCode}.`
    });
  } catch (err) {
    console.error('[DiscordSync] failed', err);

    res.status(500).json({
      ok: false,
      status: 'discord_sync_failed',
      error: err?.message || 'Discord sync failed'
    });
  }
});

app.get('/api/discord/syncs', (req, res) => {
  try {
    res.json({
      ok: true,
      pending: listPendingSyncs()
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err?.message || 'Failed to list pending syncs'
    });
  }
});

/**
 * Sessions
 */
app.post('/api/session', (req, res) => {
  const session = createSession(req.body || {});
  seedTraffic(session, req.body?.trafficDensity || 'medium');
  broadcast({ type: 'session_created', session });
  res.json(session);
});

app.get('/api/sessions', (req, res) => {
  res.json(listSessions());
});

app.get('/api/session/:id', (req, res) => {
  const s = getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  res.json(s);
});

app.delete('/api/session/:id', (req, res) => {
  res.json({ ok: deleteSession(req.params.id) });
});

/**
 * Pilot text → ATC response
 */
app.post('/api/session/:id/pilot-text', async (req, res) => {
  try {
    const s = getSession(req.params.id);
    if (!s) return res.status(404).json({ error: 'session not found' });

    const result = handlePilotText(s, req.body?.text || '');
    const audio = await synthesizeSpeech({ text: result.text, role: 'atc' });

    broadcast({ type: 'atc', sessionId: s.id, result, audio });
    res.json({ result, audio });
  } catch (err) {
    log('Server', `pilot-text error: ${err?.message || err}`);
    res.status(500).json({ error: err?.message || 'pilot-text failed' });
  }
});

/**
 * AI traffic response
 */
app.post('/api/session/:id/traffic', async (req, res) => {
  try {
    const s = getSession(req.params.id);
    if (!s) return res.status(404).json({ error: 'session not found' });

    const result = nextTrafficTransmission(s);
    const audio = await synthesizeSpeech({ text: result.text, role: 'traffic' });

    broadcast({ type: 'traffic', sessionId: s.id, result, audio });
    res.json({ result, audio });
  } catch (err) {
    log('Server', `traffic error: ${err?.message || err}`);
    res.status(500).json({ error: err?.message || 'traffic failed' });
  }
});

/**
 * Speak directly into Discord voice
 */
app.post('/api/session/:id/discord-speak', async (req, res) => {
  try {
    const s = getSession(req.params.id);
    if (!s) return res.status(404).json({ error: 'session not found' });

    const guildId = req.body?.guildId || s.discordGuildId || s.guildId;
    const text = req.body?.text || s.lastAtcText;
    const role = req.body?.role || 'atc';

    const result = await speakToGuild(guildId, text, role);
    res.json(result);
  } catch (err) {
    log('Server', `discord-speak error: ${err?.message || err}`);
    res.status(500).json({ error: err?.message || 'discord-speak failed' });
  }
});

/**
 * Optional frontend fallback
 *
 * Keep this LAST so it does not interfere with API routes.
 */
app.get('*', (req, res) => {
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }

  res.status(404).json({
    ok: false,
    error: 'No frontend index.html found',
    service: 'SkyEcho ATC Discord Bot',
    hint: 'Backend is running. This route has no web page.'
  });
});

const server = app.listen(port, () => {
  log('Server', `http://localhost:${port}`);
  startDelayedNavDataLoad();
});

const wss = new WebSocketServer({ server });
const sockets = new Set();

wss.on('connection', ws => {
  sockets.add(ws);
  ws.on('close', () => sockets.delete(ws));
});

function broadcast(data) {
  const msg = JSON.stringify(data);

  for (const ws of sockets) {
    if (ws.readyState === 1) {
      ws.send(msg);
    }
  }
}

startDiscordBot();
