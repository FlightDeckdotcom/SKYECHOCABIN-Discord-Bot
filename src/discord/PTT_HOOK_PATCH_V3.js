// src/discord/PTT_HOOK_PATCH_V3.js
// Add these two calls in the exact file that logs:
// [DiscordPTT] ... PTT_PRESSED_UNMUTED
// [DiscordPTT] ... PTT_RELEASED_MUTED
//
// If that file is inside src/discord, use:
import { setUserPtt, markUserActivity } from './radioState.js';

// If that file is somewhere else, change the path to:
// import { setUserPtt, markUserActivity } from '../discord/radioState.js';

// On PTT_PRESSED_UNMUTED:
setUserPtt(guildId, true, 'PTT_PRESSED_UNMUTED');

// On PTT_RELEASED_MUTED:
setUserPtt(guildId, false, 'PTT_RELEASED_MUTED');
markUserActivity(guildId);
