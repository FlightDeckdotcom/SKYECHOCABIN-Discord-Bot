const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior } = require('@discordjs/voice');
const { resolveATCIntent } = require('../atc/intentResolver');
const { buildATCResponse } = require('../atc/responseEngine');
const { getSession, updateSession } = require('../atc/sessionStore');
const { synthesizeSpeech } = require('../tts/ttsEngine');

const connections = new Map();
const players = new Map();

function connectToVoiceChannel(channel) {
  const connection = joinVoiceChannel({ channelId: channel.id, guildId: channel.guild.id, adapterCreator: channel.guild.voiceAdapterCreator, selfDeaf: false });
  const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
  connection.subscribe(player);
  connections.set(channel.guild.id, connection);
  players.set(channel.guild.id, player);
  return connection;
}

async function speakATC(guildId, text) {
  console.log('[ATC OUT]', text);
  const player = players.get(guildId);
  if (!player) { console.log('[AUDIO] no voice player for guild; run !sky join first'); return; }
  try {
    const audioPath = await synthesizeSpeech(text, 'atc');
    if (!audioPath) return;
    console.log('[AUDIO] playing', audioPath);
    const resource = createAudioResource(audioPath);
    player.play(resource);
    await new Promise(resolve => player.once(AudioPlayerStatus.Idle, resolve));
  } catch (err) {
    console.error('[TTS ERROR]', err.message);
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

module.exports = { connectToVoiceChannel, speakATC, handleTranscript };
