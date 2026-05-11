require('dotenv').config();

const { Client, GatewayIntentBits, Partials } = require('discord.js');

const {
  connectToVoiceChannel,
  leaveVoiceChannel,
  handleTranscript,
  speakATC,
  speakRole
} = require('./discord/voiceManager');

const {
  getSession,
  resetSession,
  updateSession
} = require('./atc/sessionStore');

const token = process.env.DISCORD_TOKEN;
const prefix = process.env.COMMAND_PREFIX || '!sky';

if (!token) {
  console.error('Missing DISCORD_TOKEN. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel]
});

client.once('ready', () => {
  console.log(`SkyEcho Discord Bot online as ${client.user.tag}`);
  console.log(`Command prefix: ${prefix}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(prefix)) return;

  const guildId = message.guild?.id || 'default';

  const args = message.content
    .slice(prefix.length)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const cmd = (args.shift() || '').toLowerCase();

  try {
    if (!cmd || cmd === 'help') {
      return message.reply(getHelpText());
    }

    if (cmd === 'join') {
      const channel = message.member?.voice?.channel;

      if (!channel) {
        return message.reply('Join a voice channel first, then run `!sky join`.');
      }

      await connectToVoiceChannel(channel);

      return message.reply(`SkyEcho connected to **${channel.name}**.`);
    }

    if (cmd === 'leave') {
      await leaveVoiceChannel(guildId);
      return message.reply('SkyEcho disconnected from voice.');
    }

    if (cmd === 'voice-test') {
      const role = normalizeRole(args.shift() || 'atc');

      const samples = {
        atc: 'SkyEcho ATC radio check. Piper voice online.',
        traffic: 'Caribbean two three four, climbing flight level three four zero.',
        cabin: 'Ladies and gentlemen, welcome aboard SkyEcho Cabin.'
      };

      const text = args.join(' ') || samples[role] || samples.atc;

      await speakRole(guildId, text, role);

      return message.reply(`Voice test sent for role: **${role}**.`);
    }

    if (cmd === 'say') {
      const text = args.join(' ').trim();

      if (!text) {
        return message.reply(
          'Use: `!sky say Center, SkyEcho seven three eight, maintaining flight level three four zero`'
        );
      }

      await handleTranscript(guildId, text);

      return message.reply('Processed test transcript.');
    }

    if (cmd === 'atc') {
      const text = args.join(' ').trim();

      if (!text) {
        return message.reply('Use: `!sky atc Caribbean two six eight, radar contact.`');
      }

      await speakATC(guildId, text);

      return message.reply('ATC line sent to voice/TTS.');
    }

    if (cmd === 'traffic') {
      const text = args.join(' ').trim();

      if (!text) {
        return message.reply('Use: `!sky traffic Caribbean Wings five five six six, ready for departure.`');
      }

      await speakRole(guildId, text, 'traffic');

      return message.reply('Traffic pilot line sent to voice/TTS.');
    }

    if (cmd === 'cabin') {
      const text = args.join(' ').trim();

      if (!text) {
        return message.reply('Use: `!sky cabin Cabin crew, prepare for takeoff.`');
      }

      await speakRole(guildId, text, 'cabin');

      return message.reply('Cabin line sent to voice/TTS.');
    }

    if (cmd === 'session') {
      const session = getSession(guildId);

      return message.reply({
        content: '```json\n' + JSON.stringify(session, null, 2) + '\n```'
      });
    }

    if (cmd === 'reset') {
      const session = resetSession(guildId);

      return message.reply({
        content: 'Session reset.\n```json\n' + JSON.stringify(session, null, 2) + '\n```'
      });
    }

    if (cmd === 'callsign') {
      const callsign = args.join(' ').trim();

      if (!callsign) {
        return message.reply('Use: `!sky callsign Caribbean Airlines two six eight`');
      }

      updateSession(guildId, { callsign });

      return message.reply(`Callsign set to: **${callsign}**.`);
    }

    if (cmd === 'phase') {
      const phase = (args[0] || '').toLowerCase();

      const allowedPhases = [
        'preflight',
        'clearance',
        'pushback',
        'taxi',
        'tower',
        'departure',
        'climb',
        'enroute',
        'descent',
        'approach',
        'landing',
        'taxi_in',
        'gate'
      ];

      if (!phase) {
        return message.reply(
          'Use: `!sky phase preflight|clearance|pushback|taxi|tower|departure|climb|enroute|descent|approach|landing|taxi_in|gate`'
        );
      }

      if (!allowedPhases.includes(phase)) {
        return message.reply(
          `Unknown phase: **${phase}**\nAllowed phases: \`${allowedPhases.join('`, `')}\``
        );
      }

      updateSession(guildId, { phase });

      return message.reply(`Phase set to: **${phase}**.`);
    }

    if (cmd === 'freq' || cmd === 'frequency') {
      const frequency = args[0];

      if (!frequency) {
        return message.reply('Use: `!sky freq 121.90`');
      }

      updateSession(guildId, { frequency });

      return message.reply(`Frequency set to: **${frequency}**.`);
    }

    if (cmd === 'airport') {
      const airport = (args[0] || '').toUpperCase();

      if (!airport) {
        return message.reply('Use: `!sky airport TAPA`');
      }

      updateSession(guildId, { airport });

      return message.reply(`Airport set to: **${airport}**.`);
    }

    return message.reply(getHelpText());
  } catch (err) {
    console.error('SkyEcho command error:', err);

    return message.reply(`SkyEcho error: ${err.message || String(err)}`);
  }
});

function normalizeRole(role) {
  const value = String(role || 'atc').toLowerCase();

  if (['atc', 'controller', 'control'].includes(value)) return 'atc';
  if (['traffic', 'pilot', 'ai', 'aircraft'].includes(value)) return 'traffic';
  if (['cabin', 'crew', 'flight-attendant'].includes(value)) return 'cabin';

  return 'atc';
}

function getHelpText() {
  return [
    '**SkyEcho commands**',
    '`!sky join` - join your voice channel',
    '`!sky leave` - disconnect from voice',
    '`!sky voice-test atc|traffic|cabin` - test voice playback',
    '`!sky say <pilot phrase>` - test transcript/intent handling',
    '`!sky atc <line>` - speak a raw ATC line',
    '`!sky traffic <line>` - speak an AI traffic pilot line',
    '`!sky cabin <line>` - speak a cabin crew line',
    '`!sky callsign <callsign>` - set aircraft callsign',
    '`!sky phase <phase>` - set flight phase',
    '`!sky freq <frequency>` - set active frequency',
    '`!sky airport <ICAO>` - set active airport',
    '`!sky session` - show ATC state',
    '`!sky reset` - reset ATC state'
  ].join('\n');
}

client.login(token);
