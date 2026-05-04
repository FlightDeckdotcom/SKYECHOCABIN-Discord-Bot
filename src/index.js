require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { connectToVoiceChannel, handleTranscript, speakATC } = require('./discord/voiceManager');
const { getSession, resetSession, updateSession } = require('./atc/sessionStore');

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
  if (message.author.bot || !message.content.startsWith(prefix)) return;

  const guildId = message.guild?.id || 'default';
  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmd = (args.shift() || '').toLowerCase();

  try {
    if (cmd === 'join') {
      const channel = message.member?.voice?.channel;
      if (!channel) return message.reply('Join a voice channel first, then run `!sky join`.');
      connectToVoiceChannel(channel);
      return message.reply(`SkyEcho connected to ${channel.name}.`);
    }

    if (cmd === 'say') {
      const text = args.join(' ');
      if (!text) return message.reply('Use: `!sky say Center, SkyEcho 738, maintaining flight level three four zero`');
      await handleTranscript(guildId, text);
      return message.reply('Processed test transcript.');
    }

    if (cmd === 'atc') {
      const text = args.join(' ');
      if (!text) return message.reply('Use: `!sky atc text to speak`');
      await speakATC(guildId, text);
      return message.reply('ATC line sent to voice/TTS.');
    }

    if (cmd === 'session') {
      return message.reply('```json\n' + JSON.stringify(getSession(guildId), null, 2) + '\n```');
    }

    if (cmd === 'reset') {
      const session = resetSession(guildId);
      return message.reply('Session reset.```json\n' + JSON.stringify(session, null, 2) + '\n```');
    }

    if (cmd === 'callsign') {
      const callsign = args.join(' ');
      if (!callsign) return message.reply('Use: `!sky callsign JetBlue Four Three Two`');
      updateSession(guildId, { callsign });
      return message.reply(`Callsign set to: ${callsign}`);
    }

    if (cmd === 'phase') {
      const phase = args[0];
      if (!phase) return message.reply('Use: `!sky phase departure|enroute|descent|approach|tower`');
      updateSession(guildId, { phase });
      return message.reply(`Phase set to: ${phase}`);
    }

    return message.reply([
      '**SkyEcho commands**',
      '`!sky join` - join your voice channel',
      '`!sky say <pilot phrase>` - test Vosk/transcript intent handling',
      '`!sky atc <line>` - speak a raw ATC line',
      '`!sky callsign <callsign>` - set aircraft callsign',
      '`!sky phase <phase>` - set phase',
      '`!sky session` - show ATC state',
      '`!sky reset` - reset ATC state'
    ].join('\n'));
  } catch (err) {
    console.error(err);
    return message.reply(`SkyEcho error: ${err.message}`);
  }
});

client.login(token);
