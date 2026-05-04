// src/discord/radioState.js
// SkyEcho Discord hard radio lock v3.
// Uses globalThis so PTT state is shared even if Node imports this module through
// different relative paths during development/builds.

const GLOBAL_KEY = '__SKYECHO_DISCORD_RADIO_STATE_V3__';

if (!globalThis[GLOBAL_KEY]) {
  globalThis[GLOBAL_KEY] = {
    radioStateByGuild: new Map()
  };
}

const shared = globalThis[GLOBAL_KEY];

export function getRadioState(guildId) {
  const id = String(guildId || 'default');

  if (!shared.radioStateByGuild.has(id)) {
    shared.radioStateByGuild.set(id, {
      userPttActive: false,
      atcSpeaking: false,
      trafficSpeaking: false,
      lastUserPttAt: 0,
      lastUserReleaseAt: 0,
      lastAtcAt: 0,
      lastTrafficAt: 0,
      lastAnyAudioAt: 0,
      lastPttSource: ''
    });
  }

  return shared.radioStateByGuild.get(id);
}

export function setUserPtt(guildId, active, source = 'discord-ptt') {
  const state = getRadioState(guildId);
  state.userPttActive = Boolean(active);
  state.lastPttSource = source;

  if (active) {
    state.lastUserPttAt = Date.now();
    state.lastAnyAudioAt = Date.now();
    console.log(`[RadioState] USER PTT ACTIVE guild=${guildId} source=${source}`);
  } else {
    state.lastUserReleaseAt = Date.now();
    state.lastAnyAudioAt = Date.now();
    console.log(`[RadioState] USER PTT RELEASED guild=${guildId} source=${source}`);
  }

  return state;
}

export function setAtcSpeaking(guildId, active) {
  const state = getRadioState(guildId);
  state.atcSpeaking = Boolean(active);

  if (active) {
    state.lastAtcAt = Date.now();
    state.lastAnyAudioAt = Date.now();
  } else {
    state.lastAnyAudioAt = Date.now();
  }

  return state;
}

export function setTrafficSpeaking(guildId, active) {
  const state = getRadioState(guildId);
  state.trafficSpeaking = Boolean(active);

  if (active) {
    state.lastTrafficAt = Date.now();
    state.lastAnyAudioAt = Date.now();
  } else {
    state.lastAnyAudioAt = Date.now();
  }

  return state;
}

export function markUserActivity(guildId) {
  const state = getRadioState(guildId);
  state.lastUserReleaseAt = Date.now();
  state.lastAnyAudioAt = Date.now();
  return state;
}

export function isUserPttActive(guildId) {
  return Boolean(getRadioState(guildId).userPttActive);
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
  if (state.lastAnyAudioAt && now - state.lastAnyAudioAt < Math.min(quietMs, 1800)) return true;

  return false;
}

export async function waitForClearRadio(guildId, {
  quietMs = 2500,
  pollMs = 250,
  maxWaitMs = 60000,
  logPrefix = '[RadioState]'
} = {}) {
  const started = Date.now();

  while (isRadioBusy(guildId, quietMs)) {
    const state = getRadioState(guildId);

    if (Date.now() - started > maxWaitMs) {
      console.warn(`${logPrefix} radio still busy after ${maxWaitMs}ms; state=${JSON.stringify({
        userPttActive: state.userPttActive,
        atcSpeaking: state.atcSpeaking,
        trafficSpeaking: state.trafficSpeaking,
        lastPttSource: state.lastPttSource
      })}`);
      return false;
    }

    await wait(pollMs);
  }

  return true;
}

export async function speakWithRadioLock({
  guildId,
  role = 'atc',
  text,
  speakToGuild,
  quietMsBefore = 1800,
  maxWaitMs = 60000
}) {
  if (!guildId || typeof speakToGuild !== 'function' || !String(text || '').trim()) {
    return { ok: false, reason: 'missing_args' };
  }

  await waitForClearRadio(guildId, {
    quietMs: quietMsBefore,
    pollMs: 250,
    maxWaitMs,
    logPrefix: '[RadioState]'
  });

  // Final last-millisecond check. This is the key guard that was missing.
  if (isRadioBusy(guildId, 200)) {
    await waitForClearRadio(guildId, {
      quietMs: quietMsBefore,
      pollMs: 250,
      maxWaitMs,
      logPrefix: '[RadioState]'
    });
  }

  if (role === 'traffic') setTrafficSpeaking(guildId, true);
  else setAtcSpeaking(guildId, true);

  try {
    return await speakToGuild(guildId, text, role);
  } finally {
    if (role === 'traffic') setTrafficSpeaking(guildId, false);
    else setAtcSpeaking(guildId, false);
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
