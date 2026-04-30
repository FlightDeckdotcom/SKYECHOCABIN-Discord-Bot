import { Client, GatewayIntentBits, Events, SlashCommandBuilder } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior } from '@discordjs/voice';
import path from 'path';
import { createSession, getSession, updateSession } from '../atc/sessionStore.js';
import { handlePilotText } from '../atc/atcEngine.js';
import { nextTrafficTransmission, seedTraffic } from '../traffic/syntheticTraffic.js';
import { synthesizeSpeech } from '../tts/ttsEngine.js';
import { transcribeAudioFile } from '../stt/sttEngine.js';
import { startPilotRecording, stopPilotRecording } from './voiceRecorder.js';
import { log, warn } from '../utils/logger.js';

const players = new Map();
let client;

export function getSlashCommands() {
  return [
    new SlashCommandBuilder().setName('join').setDescription('Join your current voice channel'),
    new SlashCommandBuilder().setName('leave').setDescription('Leave voice channel'),
    new SlashCommandBuilder().setName('start_atc').setDescription('Start a SkyEcho ATC session')
      .addStringOption(o => o.setName('callsign').setDescription('Example LIAT319').setRequired(false))
      .addStringOption(o => o.setName('route').setDescription('Example TKPK SKB G633 ANU DCT TAPA').setRequired(false))
      .addStringOption(o => o.setName('cruise').setDescription('Example FL310').setRequired(false)),
    new SlashCommandBuilder().setName('pilot').setDescription('Send pilot text to ATC engine for testing')
      .addStringOption(o => o.setName('text').setDescription('Pilot transmission').setRequired(true)),
    new SlashCommandBuilder().setName('traffic').setDescription('Inject one synthetic traffic radio call'),
    new SlashCommandBuilder().setName('repeat_last').setDescription('Repeat last ATC instruction'),
    new SlashCommandBuilder().setName('stt_status').setDescription('Show Discord voice receive / STT mode status')
  ].map(c => c.toJSON());
}

export async function startDiscordBot() {
  if (!process.env.DISCORD_TOKEN) {
    warn('Discord', 'DISCORD_TOKEN not set. Bot disabled; web console still works.');
    return null;
  }

  client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
  client.once(Events.ClientReady, c => log('Discord', `Logged in as ${c.user.tag}`));

  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    try {
      if (interaction.commandName === 'join') {
        await interaction.deferReply({ ephemeral: true });
        const conn = joinUserVoice(interaction);
        await interaction.editReply(conn ? 'SkyEcho joined your voice channel. Discord mute/unmute PTT is armed.' : 'Join a voice channel first.');
      }
      if (interaction.commandName === 'leave') {
        const key = interaction.guildId;
        const p = players.get(key);
        p?.connection?.destroy();
        players.delete(key);
        await interaction.reply({ content: 'SkyEcho left voice channel.', ephemeral: true });
      }
      if (interaction.commandName === 'start_atc') {
        await interaction.deferReply({ ephemeral: true });
        const conn = joinUserVoice(interaction);
        const session = createSession({
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          callsign: interaction.options.getString('callsign') || 'LIAT319',
          route: interaction.options.getString('route') || 'TKPK SKB G633 ANU DCT TAPA',
          cruise: interaction.options.getString('cruise') || 'FL310'
        });
        updateSession(session.id, { discordGuildId: interaction.guildId });
        seedTraffic(session);
        if (conn) conn.sessionId = session.id;
        await interaction.editReply(`SkyEcho ATC session started. Session ID: ${session.id}. Use /pilot text for manual testing, or unmute/mute for Discord PTT if STT_MODE is enabled.`);
      }
      if (interaction.commandName === 'pilot') {
        await interaction.deferReply();
        const p = players.get(interaction.guildId);
        const session = p?.sessionId ? getSession(p.sessionId) : createSession({ guildId: interaction.guildId, channelId: interaction.channelId });
        if (p && !p.sessionId) p.sessionId = session.id;
        const result = handlePilotText(session, interaction.options.getString('text'));
        await speakToGuild(interaction.guildId, result.text, 'atc');
        await interaction.editReply(`ATC: ${result.text}`);
      }
      if (interaction.commandName === 'traffic') {
        await interaction.deferReply();
        const p = players.get(interaction.guildId);
        const session = p?.sessionId ? getSession(p.sessionId) : createSession({ guildId: interaction.guildId, channelId: interaction.channelId });
        if (p && !p.sessionId) p.sessionId = session.id;
        const t = nextTrafficTransmission(session);
        await speakToGuild(interaction.guildId, t.text, 'traffic');
        await interaction.editReply(`TRAFFIC: ${t.text}`);
      }
      if (interaction.commandName === 'repeat_last') {
        const p = players.get(interaction.guildId);
        const session = p?.sessionId ? getSession(p.sessionId) : null;
        const text = session?.lastAtcText || 'No active instruction.';
        await speakToGuild(interaction.guildId, text, 'atc');
        await interaction.reply(text);
      }
      if (interaction.commandName === 'stt_status') {
        const p = players.get(interaction.guildId);
        await interaction.reply({
          content: `Voice bridge: ${p?.connection ? 'joined' : 'not joined'}\nSTT_MODE: ${process.env.STT_MODE || 'manual'}\nPTT method: Discord mute/unmute\nOpenAI key present: ${process.env.OPENAI_API_KEY ? 'yes' : 'no'}\nVosk model: ${process.env.VOSK_MODEL_PATH || './models/vosk-model-small-en-us-0.15'}`,
          ephemeral: true
        });
      }
    } catch (e) {
      warn('Discord', e.stack || e.message);
      if (interaction.deferred) await interaction.editReply(`Error: ${e.message}`);
      else await interaction.reply({ content: `Error: ${e.message}`, ephemeral: true });
    }
  });

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    if (oldState.selfMute === newState.selfMute) return;
    if (newState.member?.user?.bot) return;

    const guildId = newState.guild.id;
    const record = players.get(guildId);
    const displayName = newState.member?.displayName || newState.id;
    const mode = newState.selfMute ? 'PTT_RELEASED_MUTED' : 'PTT_PRESSED_UNMUTED';
    log('DiscordPTT', `${displayName}: ${mode}`);

    if (!record?.connection) {
      warn('DiscordPTT', 'PTT ignored because SkyEcho is not joined to the voice channel. Run /join first.');
      return;
    }

    if (!newState.selfMute) {
      startPilotRecording({ guildId, connection: record.connection, userId: newState.id, displayName });
      return;
    }

    const rec = await stopPilotRecording({ guildId, userId: newState.id });
    if (!rec.ok) {
      warn('DiscordPTT', `Recording ignored for ${displayName}: ${rec.reason || 'unknown'}`);
      return;
    }

    const stt = await transcribeAudioFile(rec.wavPath, { userId: newState.id, displayName });
    if (!stt.text) {
      warn('STT', stt.reason || stt.error || 'No transcript returned.');
      return;
    }

    log('STT', `${displayName}: ${stt.text}`);
    const session = record.sessionId ? getSession(record.sessionId) : createSession({ guildId, channelId: newState.channelId });
    if (!record.sessionId) record.sessionId = session.id;
    const result = handlePilotText(session, stt.text);
    await speakToGuild(guildId, result.text, 'atc');
  });

  await client.login(process.env.DISCORD_TOKEN);
  return client;
}

function joinUserVoice(interaction) {
  const voiceChannel = interaction.member?.voice?.channel;
  if (!voiceChannel) return null;
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false
  });
  const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
  connection.subscribe(player);
  const record = players.get(interaction.guildId) || {};
  players.set(interaction.guildId, { ...record, connection, player });
  return players.get(interaction.guildId);
}

export async function speakToGuild(guildId, text, role = 'atc') {
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
  const resource = createAudioResource(fullPath);
  record.player.play(resource);
  return new Promise(resolve => {
    const done = () => resolve({ ok: true, audio });
    record.player.once(AudioPlayerStatus.Idle, done);
    setTimeout(done, 15000);
  });
}
