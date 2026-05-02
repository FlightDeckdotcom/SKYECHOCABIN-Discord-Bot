import { Client, GatewayIntentBits, Events, SlashCommandBuilder } from 'discord.js';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior
} from '@discordjs/voice';

import path from 'path';

import { createSession, getSession, updateSession } from '../atc/sessionStore.js';
import { handlePilotText } from '../atc/atcEngine.js';
import { nextTrafficTransmission, seedTraffic } from '../traffic/syntheticTraffic.js';
import { synthesizeSpeech } from '../tts/ttsEngine.js';
import { transcribeAudioFile } from '../stt/sttEngine.js';
import { startPilotRecording, stopPilotRecording } from './voiceRecorder.js';
import { log, warn } from '../utils/logger.js';
import { normalizeAviationStt } from '../utils/aviationSttNormalizer.js';

import {
  consumePendingSyncForChannel,
  getActiveSyncForDiscordUser
} from '../discord/discordSyncStore.js';

const players = new Map();
let client;

export function getSlashCommands() {
  return [
    new SlashCommandBuilder()
      .setName('join')
      .setDescription('Join your current voice channel'),

    new SlashCommandBuilder()
      .setName('leave')
      .setDescription('Leave voice channel'),

    new SlashCommandBuilder()
      .setName('start_atc')
      .setDescription('Start a SkyEcho ATC session')
      .addStringOption(o =>
        o.setName('callsign')
          .setDescription('Example LIAT319')
          .setRequired(false)
      )
      .addStringOption(o =>
        o.setName('route')
          .setDescription('Example TKPK SKB G633 ANU DCT TAPA')
          .setRequired(false)
      )
      .addStringOption(o =>
        o.setName('cruise')
          .setDescription('Example FL310')
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName('pilot')
      .setDescription('Send pilot text to ATC engine for testing')
      .addStringOption(o =>
        o.setName('text')
          .setDescription('Pilot transmission')
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName('traffic')
      .setDescription('Inject one synthetic traffic radio call'),

    new SlashCommandBuilder()
      .setName('repeat_last')
      .setDescription('Repeat last ATC instruction'),

    new SlashCommandBuilder()
      .setName('stt_status')
      .setDescription('Show Discord voice receive / STT mode status')
  ].map(c => c.toJSON());
}

export async function startDiscordBot() {
  if (!process.env.DISCORD_TOKEN) {
    warn('Discord', 'DISCORD_TOKEN not set. Bot disabled; web console still works.');
    return null;
  }

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates
    ]
  });

  client.once(Events.ClientReady, c => {
    log('Discord', `Logged in as ${c.user.tag}`);
    log('Discord', 'Auto radio bridge armed. Users can join an approved SkyEcho voice channel.');
  });

  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    try {
      if (interaction.commandName === 'join') {
        await deferSafe(interaction, true);

        const conn = joinUserVoice(interaction);

        await safeReply(
          interaction,
          conn
            ? 'SkyEcho joined your voice channel. Discord mute/unmute PTT is armed.'
            : 'Join a voice channel first.'
        );

        return;
      }

      if (interaction.commandName === 'leave') {
        await deferSafe(interaction, true);

        const key = interaction.guildId;
        const p = players.get(key);

        p?.connection?.destroy();
        players.delete(key);

        await safeReply(interaction, 'SkyEcho left voice channel.');
        return;
      }

      if (interaction.commandName === 'start_atc') {
        await deferSafe(interaction, true);

        const conn = joinUserVoice(interaction);

        const session = createSession({
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          discordGuildId: interaction.guildId,
          discordChannelId: interaction.member?.voice?.channelId || null,
          discordUserId: interaction.user.id,
          callsign: interaction.options.getString('callsign') || 'LIAT319',
          route: interaction.options.getString('route') || 'TKPK SKB G633 ANU DCT TAPA',
          cruise: interaction.options.getString('cruise') || 'FL310'
        });

        updateSession(session.id, {
          discordGuildId: interaction.guildId,
          discordChannelId: interaction.member?.voice?.channelId || null,
          discordUserId: interaction.user.id
        });

        seedTraffic(session);

        if (conn) conn.sessionId = session.id;

        await safeReply(
          interaction,
          `SkyEcho ATC session started. Session ID: ${session.id}. Use Discord PTT or /pilot text for testing.`
        );

        return;
      }

      if (interaction.commandName === 'pilot') {
        await deferSafe(interaction, false);

        const p = players.get(interaction.guildId);

        const session =
          p?.sessionId
            ? getSession(p.sessionId)
            : createSession({
                guildId: interaction.guildId,
                channelId: interaction.channelId,
                discordGuildId: interaction.guildId,
                discordUserId: interaction.user.id
              });

        if (p && !p.sessionId) p.sessionId = session.id;

        const rawText = interaction.options.getString('text') || '';
        const cleanedText = normalizeAviationStt(rawText, getNormalizerContext(session));

        log('STT', `${interaction.user.username} MANUAL RAW: ${rawText}`);
        log('STT', `${interaction.user.username} MANUAL CLEAN: ${cleanedText}`);

        const result = handlePilotText(session, cleanedText);

        await speakToGuild(interaction.guildId, result.text, 'atc');
        await safeReply(interaction, `ATC: ${result.text}`);

        return;
      }

      if (interaction.commandName === 'traffic') {
        await deferSafe(interaction, false);

        const p = players.get(interaction.guildId);

        const session =
          p?.sessionId
            ? getSession(p.sessionId)
            : createSession({
                guildId: interaction.guildId,
                channelId: interaction.channelId,
                discordGuildId: interaction.guildId,
                discordUserId: interaction.user.id
              });

        if (p && !p.sessionId) p.sessionId = session.id;

        const t = nextTrafficTransmission(session);

        await speakToGuild(interaction.guildId, t.text, 'traffic');
        await safeReply(interaction, `TRAFFIC: ${t.text}`);

        return;
      }

      if (interaction.commandName === 'repeat_last') {
        await deferSafe(interaction, false);

        const p = players.get(interaction.guildId);
        const session = p?.sessionId ? getSession(p.sessionId) : null;

        const text = session?.lastAtcText || 'No active instruction.';

        await speakToGuild(interaction.guildId, text, 'atc');
        await safeReply(interaction, text);

        return;
      }

      if (interaction.commandName === 'stt_status') {
        await deferSafe(interaction, true);

        const p = players.get(interaction.guildId);

        await safeReply(
          interaction,
          [
            `Voice bridge: ${p?.connection ? 'joined' : 'not joined'}`,
            `Session ID: ${p?.sessionId || 'none'}`,
            `STT_MODE: ${process.env.STT_MODE || 'manual'}`,
            `PTT method: Discord mute/unmute`,
            `STT cleanup: aviation normalizer enabled`,
            `OpenAI key present: ${process.env.OPENAI_API_KEY ? 'yes' : 'no'}`,
            `Vosk model: ${process.env.VOSK_MODEL_PATH || './models/vosk-model-small-en-us-0.15'}`,
            `Autojoin channels: ${process.env.SKYECHO_AUTOJOIN_CHANNEL_IDS || process.env.SKYECHO_DEFAULT_VOICE_CHANNEL_ID || 'not set'}`
          ].join('\n')
        );

        return;
      }
    } catch (e) {
      warn('Discord', e.stack || e.message);
      await safeReply(interaction, `Error: ${e.message}`);
    }
  });

  /**
   * AUTO RADIO BRIDGE:
   * User joins approved SkyEcho voice channel → bot joins automatically.
   * No /join required.
   */
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    try {
      if (newState.member?.user?.bot) return;

      /**
       * User joined or moved voice channel.
       */
      const joinedNewChannel =
        oldState.channelId !== newState.channelId &&
        Boolean(newState.channelId);

      if (joinedNewChannel && isSkyEchoVoiceChannel(newState.channel)) {
        await autoStartRadioBridge(newState);
      }

      /**
       * Discord mute/unmute as PTT.
       */
      if (oldState.selfMute === newState.selfMute) return;

      await handleMutePtt(oldState, newState);
    } catch (err) {
      warn('DiscordVoiceState', err.stack || err.message);
    }
  });

  await client.login(process.env.DISCORD_TOKEN);
  return client;
}

async function autoStartRadioBridge(newState) {
  const member = newState.member;
  const channel = newState.channel;

  if (!member || !channel) return;

  const guildId = newState.guild.id;
  const channelId = channel.id;
  const userId = member.user.id;
  const displayName = member.displayName || member.user.username || userId;

  log('DiscordAutoJoin', `${displayName} joined ${channel.name} (${channelId})`);

  const record = joinVoiceChannelDirect({
    guild: newState.guild,
    channel
  });

  let session = null;

  /**
   * First preference:
   * Use a synced session for this channel from the web app.
   */
  const synced = consumePendingSyncForChannel(channelId, userId);

  if (synced) {
    session = createSession({
      guildId,
      channelId,
      discordGuildId: guildId,
      discordChannelId: channelId,
      discordUserId: userId,
      callsign: synced.callsign || 'LIAT319',
      spokenCallsign: synced.spokenCallsign,
      route: synced.route || 'TKPK SKB G633 ANU DCT TAPA',
      cruise: synced.cruise || 'FL310',
      aircraft: synced.aircraft || '',
      departure: synced.departure || '',
      arrival: synced.arrival || ''
    });

    updateSession(session.id, {
      discordGuildId: guildId,
      discordChannelId: channelId,
      discordUserId: userId,
      syncedFromWeb: true,
      syncId: synced.syncId,
      pairingCode: synced.pairingCode
    });

    seedTraffic(session, synced.trafficDensity || 'medium');

    record.sessionId = session.id;

    await speakToGuild(
      guildId,
      `SkyEcho synced. ${session.spokenCallsign || synced.spokenCallsign || synced.callsign}, clearance delivery is online.`,
      'atc'
    );

    log('DiscordAutoJoin', `Loaded synced session ${session.id} for ${displayName}`);
    return;
  }

  /**
   * Second preference:
   * Resume active sync for this Discord user.
   */
  const active = getActiveSyncForDiscordUser(userId);

  if (active) {
    session = createSession({
      guildId,
      channelId,
      discordGuildId: guildId,
      discordChannelId: channelId,
      discordUserId: userId,
      callsign: active.callsign || 'LIAT319',
      spokenCallsign: active.spokenCallsign,
      route: active.route || 'TKPK SKB G633 ANU DCT TAPA',
      cruise: active.cruise || 'FL310',
      aircraft: active.aircraft || '',
      departure: active.departure || '',
      arrival: active.arrival || ''
    });

    seedTraffic(session, active.trafficDensity || 'medium');
    record.sessionId = session.id;

    await speakToGuild(
      guildId,
      `SkyEcho session resumed. ${session.spokenCallsign || active.callsign}, radio bridge connected.`,
      'atc'
    );

    return;
  }

  /**
   * Fallback:
   * No web sync found. Create safe default voice-only session.
   */
  if (!record.sessionId) {
    session = createSession({
      guildId,
      channelId,
      discordGuildId: guildId,
      discordChannelId: channelId,
      discordUserId: userId,
      callsign: `SKY${String(userId).slice(-3)}`,
      route: 'TKPK SKB G633 ANU DCT TAPA',
      cruise: 'FL310'
    });

    seedTraffic(session, process.env.TRAFFIC_DENSITY_DEFAULT || 'medium');
    record.sessionId = session.id;

    await speakToGuild(
      guildId,
      `SkyEcho radio bridge connected. No web session sync found. Open SkyEchoCabin and press Sync With Discord, or request IFR clearance when ready.`,
      'atc'
    );
  }
}

async function handleMutePtt(oldState, newState) {
  const guildId = newState.guild.id;
  const record = players.get(guildId);

  const displayName = newState.member?.displayName || newState.id;
  const mode = newState.selfMute ? 'PTT_RELEASED_MUTED' : 'PTT_PRESSED_UNMUTED';

  log('DiscordPTT', `${displayName}: ${mode}`);

  if (!record?.connection) {
    warn('DiscordPTT', 'PTT ignored because SkyEcho is not joined to the voice channel.');
    return;
  }

  if (!newState.selfMute) {
    startPilotRecording({
      guildId,
      connection: record.connection,
      userId: newState.id,
      displayName
    });

    return;
  }

  const rec = await stopPilotRecording({
    guildId,
    userId: newState.id
  });

  if (!rec.ok) {
    warn('DiscordPTT', `Recording ignored for ${displayName}: ${rec.reason || 'unknown'}`);
    return;
  }

  const stt = await transcribeAudioFile(rec.wavPath, {
    userId: newState.id,
    displayName
  });

  if (!stt.text) {
    warn('STT', stt.reason || stt.error || 'No transcript returned.');
    return;
  }

  const session =
    record.sessionId
      ? getSession(record.sessionId)
      : createSession({
          guildId,
          channelId: newState.channelId,
          discordGuildId: guildId,
          discordChannelId: newState.channelId,
          discordUserId: newState.id
        });

  if (!record.sessionId) record.sessionId = session.id;

  const cleanedText = normalizeAviationStt(
    stt.text,
    getNormalizerContext(session)
  );

  log('STT', `${displayName} RAW: ${stt.text}`);
  log('STT', `${displayName} CLEAN: ${cleanedText}`);

  if (!cleanedText || cleanedText.length < 2) {
    warn('STT', `Cleaned transcript empty for ${displayName}. Raw: ${stt.text}`);
    return;
  }

  const result = handlePilotText(session, cleanedText);

  await speakToGuild(guildId, result.text, 'atc');
}

function getNormalizerContext(session) {
  const fallbackCallsign = 'LIAT319';

  const callsign =
    session?.callsign ||
    session?.flightNumber ||
    session?.aircraftCallsign ||
    fallbackCallsign;

  const spokenCallsign =
    session?.spokenCallsign ||
    speakCallsign(callsign);

  return {
    callsign,
    spokenCallsign,
    departure: session?.departure || session?.origin || 'TKPK',
    arrival: session?.arrival || session?.destination || 'TAPA',
    route: session?.route || 'TKPK SKB G633 ANU DCT TAPA',
    cruise: session?.cruise || 'FL310',
    runway: session?.assigned?.runway || session?.runway || '07'
  };
}

function speakCallsign(callsign) {
  const raw = String(callsign || 'LIAT319')
    .toUpperCase()
    .replace(/\s+/g, '');

  const airline = raw.match(/^[A-Z]+/)?.[0] || 'LIAT';
  const numbers = raw.match(/\d+/)?.[0] || '319';

  const digitWords = {
    0: 'zero',
    1: 'one',
    2: 'two',
    3: 'three',
    4: 'four',
    5: 'five',
    6: 'six',
    7: 'seven',
    8: 'eight',
    9: 'niner'
  };

  return `${airline} ${numbers.split('').map(d => digitWords[d] || d).join(' ')}`;
}

function joinUserVoice(interaction) {
  const voiceChannel = interaction.member?.voice?.channel;

  if (!voiceChannel) return null;

  return joinVoiceChannelDirect({
    guild: voiceChannel.guild,
    channel: voiceChannel
  });
}

function joinVoiceChannelDirect({ guild, channel }) {
  const guildId = guild.id;

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false
  });

  const player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Play
    }
  });

  connection.subscribe(player);

  const existing = players.get(guildId) || {};

  const record = {
    ...existing,
    connection,
    player,
    channelId: channel.id
  };

  players.set(guildId, record);

  return record;
}

function isSkyEchoVoiceChannel(channel) {
  if (!channel) return false;

  const allowedIds = String(
    process.env.SKYECHO_AUTOJOIN_CHANNEL_IDS ||
    process.env.SKYECHO_DEFAULT_VOICE_CHANNEL_ID ||
    ''
  )
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);

  if (allowedIds.length > 0) {
    return allowedIds.includes(channel.id);
  }

  const name = String(channel.name || '').toLowerCase();

  return (
    name.includes('skyecho') ||
    name.includes('sky echo') ||
    name.includes('atc') ||
    name.includes('flight')
  );
}

async function deferSafe(interaction, ephemeral = false) {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral });
    }
  } catch (err) {
    warn('Discord', `deferSafe ignored: ${err?.message || err}`);
  }
}

async function safeReply(interaction, content) {
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply({ content });
    }

    return await interaction.reply({
      content,
      ephemeral: true
    });
  } catch (err) {
    warn('Discord', `safeReply failed: ${err?.message || err}`);
  }
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

  const fullPath = path.join(
    process.cwd(),
    'public',
    audio.url.replace(/^\//, '')
  );

  const resource = createAudioResource(fullPath);

  record.player.play(resource);

  return new Promise(resolve => {
    let resolved = false;

    const done = () => {
      if (resolved) return;
      resolved = true;
      resolve({ ok: true, audio });
    };

    record.player.once(AudioPlayerStatus.Idle, done);
    setTimeout(done, 15000);
  });
}
