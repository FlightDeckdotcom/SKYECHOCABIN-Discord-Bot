
const fs = require('fs');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  entersState,
  StreamType,
  getVoiceConnection
} = require('@discordjs/voice');
const { resolveATCIntent } = require('../atc/intentResolver');
const { buildATCResponse } = require('../atc/responseEngine');
const { getSession, updateSession } = require('../atc/sessionStore');
const { synthesizeSpeech } = require('../tts/ttsEngine');

const connections = new Map();
const players = new Map();

function getOrCreatePlayer(guildId) {
  let player = players.get(guildId);
  if (player) return player;

  player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Play
    }
  });

  player.on(AudioPlayerStatus.Playing, () => {
    console.log('[AUDIO] player state: playing');
  });

  player.on(AudioPlayerStatus.Idle, () => {
    console.log('[AUDIO] player state: idle/finished');
  });

  player.on('error', (error) => {
    console.error('[AUDIO ERROR]', error.message || error);
  });

  players.set(guildId, player);
  return player;
}

function connectToVoiceChannel(channel) {
  const existing = getVoiceConnection(channel.guild.id);
  if (existing) {
    try { existing.destroy(); } catch (_) {}
  }

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false
  });

  connection.on(VoiceConnectionStatus.Ready, () => {
    console.log(`[VOICE] ready guild=${channel.guild.id} channel=${channel.name}`);
  });

  connection.on(VoiceConnectionStatus.Disconnected, () => {
    console.log(`[VOICE] disconnected guild=${channel.guild.id}`);
  });

  connection.on(VoiceConnectionStatus.Destroyed, () => {
    console.log(`[VOICE] destroyed guild=${channel.guild.id}`);
  });

  connection.on('error', (error) => {
    console.error('[VOICE ERROR]', error.message || error);
  });

  const player = getOrCreatePlayer(channel.guild.id);
  connection.subscribe(player);
  console.log('[AUDIO] connection subscribed to player');

  connections.set(channel.guild.id, connection);
  return connection;
}

function leaveVoiceChannel(guildId) {
  const connection = connections.get(guildId) || getVoiceConnection(guildId);
  if (connection) {
    try { connection.destroy(); } catch (_) {}
  }
  connections.delete(guildId);
  const player = players.get(guildId);
  if (player) {
    try { player.stop(true); } catch (_) {}
  }
  console.log(`[VOICE] leave requested guild=${guildId}`);
}

async function playAudioFile(guildId, filePath) {
  const connection = connections.get(guildId) || getVoiceConnection(guildId);
  if (!connection) {
    console.log('[AUDIO] no voice connection for guild; run !sky join first');
    return false;
  }

  if (!fs.existsSync(filePath)) {
    console.error('[AUDIO ERROR] file missing:', filePath);
    return false;
  }

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
  } catch (err) {
    console.error('[AUDIO ERROR] voice connection not ready:', err.message || err);
    return false;
  }

  const player = getOrCreatePlayer(guildId);
  connection.subscribe(player);
  console.log('[AUDIO] connection subscribed to player');

  if (!ffmpegPath) {
    console.error('[AUDIO ERROR] ffmpeg-static path missing');
    return false;
  }

  const ffmpeg = spawn(ffmpegPath, [
    '-hide_banner',
    '-loglevel', 'error',
    '-i', filePath,
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let ffmpegErr = '';
  ffmpeg.stderr.on('data', d => { ffmpegErr += d.toString(); });
  ffmpeg.on('close', code => {
    if (code !== 0) console.error(`[FFMPEG ERROR] code=${code} ${ffmpegErr}`);
    else console.log('[FFMPEG] conversion stream ended');
  });

  const resource = createAudioResource(ffmpeg.stdout, {
    inputType: StreamType.Raw,
    inlineVolume: true
  });

  if (resource.volume) resource.volume.setVolume(Number(process.env.DISCORD_AUDIO_VOLUME || '1.0'));

  player.play(resource);
  console.log('[AUDIO] play command sent:', filePath);

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log('[AUDIO WARN] playback wait timed out');
      resolve();
    }, 60_000);

    player.once(AudioPlayerStatus.Idle, () => {
      clearTimeout(timeout);
      resolve();
    });

    player.once('error', () => {
      clearTimeout(timeout);
      resolve();
    });
  });

  return true;
}

async function speakATC(guildId, text) {
  console.log('[ATC OUT]', text);
  try {
    const audioPath = await synthesizeSpeech(text, 'atc');
    if (!audioPath) return;
    console.log('[AUDIO] generated', audioPath);
    await playAudioFile(guildId, audioPath);
  } catch (err) {
    console.error('[TTS/AUDIO ERROR]', err.message || err);
  }
}

async function speakRole(guildId, text, role = 'atc') {
  console.log(`[${role.toUpperCase()} OUT]`, text);
  try {
    const audioPath = await synthesizeSpeech(text, role);
    if (!audioPath) return;
    console.log('[AUDIO] generated', audioPath);
    await playAudioFile(guildId, audioPath);
  } catch (err) {
    console.error('[TTS/AUDIO ERROR]', err.message || err);
  }
}

async function handleTranscript(guildId, transcript) {
  const session = getSession(guildId);
  const intentResult = resolveATCIntent(transcript, session);
  const reply = buildATCResponse(intentResult, session);

  updateSession(guildId, {
    phase: reply.nextPhase || session.phase,
    expectedPilotAction: reply.expectedPilotAction || 'open_request',
    lastInstruction: reply.text,
    lastTranscript: transcript,
    lastIntent: intentResult
  });

  console.log('[STT RAW]', transcript);
  console.log('[INTENT]', JSON.stringify(intentResult));
  await speakATC(guildId, reply.text);
  return { intentResult, reply, session: getSession(guildId) };
}

module.exports = {
  connectToVoiceChannel,
  leaveVoiceChannel,
  speakATC,
  speakRole,
  handleTranscript,
  playAudioFile
};
