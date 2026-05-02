// Patch guide for src/bot/discordBot.js

// Add imports:
import {
  createRegionalTrafficTransmission,
  getTrafficLoopIntervalMs,
  shouldRunDiscordTraffic
} from '../traffic/discordRegionalTraffic.js';
import { ensureRadioFxFiles, getRadioFxPath } from '../utils/radioFx.js';

// Add near const players = new Map();
const trafficLoops = new Map();
const voiceQueues = new Map();

// In ClientReady:
ensureRadioFxFiles();

// In autoStartRadioBridge(), after every record.sessionId = session.id:
startDiscordTrafficLoop(guildId, session);

// In /leave command:
stopDiscordTrafficLoop(key);

// Replace /traffic generation with:
const exchange = createRegionalTrafficTransmission(session);
await playDiscordTrafficExchange(interaction.guildId, session, exchange);
await safeReply(interaction, `TRAFFIC: ${exchange.pilotText}\nATC: ${exchange.atcText}`);

// Add helpers before joinUserVoice:
function startDiscordTrafficLoop(guildId, session) {
  if (!shouldRunDiscordTraffic(session)) {
    log('DiscordTraffic', `Auto traffic disabled for guild ${guildId}.`);
    return;
  }
  if (trafficLoops.has(guildId)) {
    const existing = trafficLoops.get(guildId);
    existing.sessionId = session.id;
    return;
  }
  const loop = { guildId, sessionId: session.id, stopped: false, timer: null };
  trafficLoops.set(guildId, loop);
  const scheduleNext = () => {
    if (loop.stopped) return;
    const activeSession = getSession(loop.sessionId) || session;
    const interval = getTrafficLoopIntervalMs(activeSession);
    loop.timer = setTimeout(async () => {
      try {
        const record = players.get(guildId);
        if (!record?.connection || !record?.player) {
          log('DiscordTraffic', `Skipping traffic. Bot is not in voice for guild ${guildId}.`);
        } else {
          const s = getSession(loop.sessionId) || activeSession;
          await runOneDiscordTrafficCycle(guildId, s);
        }
      } catch (err) {
        warn('DiscordTraffic', err.stack || err.message);
      } finally {
        scheduleNext();
      }
    }, interval);
  };
  log('DiscordTraffic', `Auto regional traffic started for guild ${guildId}, session ${session.id}.`);
  scheduleNext();
}

function stopDiscordTrafficLoop(guildId) {
  const loop = trafficLoops.get(guildId);
  if (!loop) return;
  loop.stopped = true;
  if (loop.timer) clearTimeout(loop.timer);
  trafficLoops.delete(guildId);
  log('DiscordTraffic', `Auto regional traffic stopped for guild ${guildId}.`);
}

async function runOneDiscordTrafficCycle(guildId, session) {
  const exchange = createRegionalTrafficTransmission(session);
  log('DiscordTraffic', `REGION=${exchange.regionName} ${exchange.callsign}`);
  log('DiscordTraffic', `PILOT: ${exchange.pilotText}`);
  log('DiscordTraffic', `ATC: ${exchange.atcText}`);
  await playDiscordTrafficExchange(guildId, session, exchange);
}

async function playDiscordTrafficExchange(guildId, session, exchange) {
  await speakToGuild(guildId, exchange.pilotText, 'traffic');
  await sleep(randomInt(650, 1300));
  await speakToGuild(guildId, exchange.atcText, 'atc');
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function randomInt(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); }

// Replace speakToGuild with the queued VHF-FX version from this snippet:
export async function speakToGuild(guildId, text, role = 'atc') {
  const previous = voiceQueues.get(guildId) || Promise.resolve();
  const task = previous.catch(() => {}).then(() => speakToGuildNow(guildId, text, role));
  voiceQueues.set(guildId, task);
  try { return await task; }
  finally { if (voiceQueues.get(guildId) === task) voiceQueues.delete(guildId); }
}

async function speakToGuildNow(guildId, text, role = 'atc') {
  const record = players.get(guildId);
  if (!record?.player) {
    warn('Discord', `No voice player for guild ${guildId}. Text: ${text}`);
    return { ok: false, reason: 'not_joined' };
  }
  const audio = await synthesizeSpeech({ text, role });
  if (!audio.playable) {
    log('DiscordMockSpeak', `${role.toUpperCase()}: ${text}`);
    return { ok: true, mock: true, audio };
  }
  const fullPath = path.join(process.cwd(), 'public', audio.url.replace(/^\//, ''));
  const useRadioFx =
    String(process.env.DISCORD_VHF_FX || 'true').toLowerCase() !== 'false' &&
    (role === 'atc' || role === 'traffic');
  if (useRadioFx) await playAudioFileToGuild(record, getRadioFxPath('key'), 2500);
  await playAudioFileToGuild(record, fullPath, 25000);
  if (useRadioFx) await playAudioFileToGuild(record, getRadioFxPath('tail'), 2500);
  return { ok: true, audio };
}

function playAudioFileToGuild(record, fullPath, timeoutMs = 15000) {
  return new Promise(resolve => {
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      resolve({ ok: true });
    };
    try {
      const resource = createAudioResource(fullPath);
      record.player.play(resource);
      record.player.once(AudioPlayerStatus.Idle, done);
      setTimeout(done, timeoutMs);
    } catch (err) {
      warn('DiscordAudio', `Failed to play ${fullPath}: ${err?.message || err}`);
      done();
    }
  });
}
