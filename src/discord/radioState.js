// src/discord/radioState.js
// SkyEcho Discord radio state lock.
// Prevents AI traffic/ATC from speaking over the real user's PTT.

const radioStateByGuild = new Map();

export function getRadioState(guildId) {
  const id = String(guildId || 'default');
  if (!radioStateByGuild.has(id)) {
    radioStateByGuild.set(id, {
      userPttActive: false,
      atcSpeaking: false,
      trafficSpeaking: false,
      lastUserPttAt: 0,
      lastUserReleaseAt: 0,
      lastAtcAt: 0,
      lastTrafficAt: 0
    });
  }
  return radioStateByGuild.get(id);
}

export function setUserPtt(guildId, active) {
  const state = getRadioState(guildId);
  state.userPttActive = Boolean(active);
  if (active) state.lastUserPttAt = Date.now();
  else state.lastUserReleaseAt = Date.now();
  return state;
}

export function setAtcSpeaking(guildId, active) {
  const state = getRadioState(guildId);
  state.atcSpeaking = Boolean(active);
  if (active) state.lastAtcAt = Date.now();
  return state;
}

export function setTrafficSpeaking(guildId, active) {
  const state = getRadioState(guildId);
  state.trafficSpeaking = Boolean(active);
  if (active) state.lastTrafficAt = Date.now();
  return state;
}

export function markUserActivity(guildId) {
  const state = getRadioState(guildId);
  state.lastUserReleaseAt = Date.now();
  return state;
}

export function isRadioBusy(guildId, quietMs = 2500) {
  const state = getRadioState(guildId);
  const now = Date.now();
  if (state.userPttActive) return true;
  if (state.atcSpeaking) return true;
  if (state.trafficSpeaking) return true;
  if (state.lastUserReleaseAt && now - state.lastUserReleaseAt < quietMs) return true;
  if (state.lastAtcAt && now - state.lastAtcAt < quietMs) return true;
  if (state.lastTrafficAt && now - state.lastTrafficAt < quietMs) return true;
  return false;
}

export async function waitForClearRadio(guildId, {
  quietMs = 2500,
  pollMs = 500,
  maxWaitMs = 30000,
  logPrefix = '[RadioState]'
} = {}) {
  const started = Date.now();
  while (isRadioBusy(guildId, quietMs)) {
    if (Date.now() - started > maxWaitMs) {
      console.warn(`${logPrefix} radio still busy after ${maxWaitMs}ms; continuing with caution.`);
      return false;
    }
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
  return true;
}
