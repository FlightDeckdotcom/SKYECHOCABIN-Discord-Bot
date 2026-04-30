import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { commands } from '../src/discord.js';
if(!process.env.DISCORD_TOKEN||!process.env.DISCORD_CLIENT_ID||!process.env.DISCORD_GUILD_ID){console.error('Missing DISCORD_TOKEN, DISCORD_CLIENT_ID, or DISCORD_GUILD_ID');process.exit(1)}
const rest=new REST({version:'10'}).setToken(process.env.DISCORD_TOKEN);
await rest.put(Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID,process.env.DISCORD_GUILD_ID),{body:commands});
console.log(`Registered ${commands.length} SkyEcho commands.`);
