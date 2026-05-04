// src/traffic/discordRegionalTraffic.js
// SkyEcho Discord Regional AI Traffic v3
// Fixes the Discord issue where AI traffic cuts into the user's transmission. v3 adds shared global radio state and stronger final PTT checks.
// This version has a hard radio lock and a full pilot -> ATC -> pilot readback exchange.

import {
  isRadioBusy,
  waitForClearRadio,
  speakWithRadioLock
} from '../discord/radioState.js';

const CARIBBEAN_AIRPORTS = new Set([
  'TKPK', 'TAPA', 'TJSJ', 'TNCM', 'TFFR', 'TFFF', 'TBPB', 'TTPP',
  'TIST', 'TISX', 'TGPY', 'TVSA', 'TVSC', 'TVSM', 'TDPD',
  'MDPC', 'MDSD', 'MKJP', 'MWCR', 'MYNN'
]);

const AIRPORT_NAMES = {
  TKPK: 'Robert L. Bradshaw, St. Kitts',
  TAPA: 'V.C. Bird, Antigua',
  TJSJ: 'San Juan',
  TNCM: 'Princess Juliana, St. Maarten',
  TFFR: 'Pointe-a-Pitre, Guadeloupe',
  TFFF: 'Martinique',
  TBPB: 'Grantley Adams, Barbados',
  TTPP: 'Piarco, Trinidad',
  TIST: 'St. Thomas',
  TISX: 'St. Croix',
  TGPY: 'Maurice Bishop, Grenada',
  TVSA: 'Argyle, St. Vincent',
  TVSC: 'Canouan',
  TVSM: 'Mustique',
  TDPD: 'Douglas Charles, Dominica',
  MDPC: 'Punta Cana',
  MDSD: 'Santo Domingo',
  MKJP: 'Kingston',
  MWCR: 'Owen Roberts, Cayman',
  MYNN: 'Nassau',
  KMIA: 'Miami International',
  KMCO: 'Orlando International',
  KJFK: 'Kennedy',
  KEWR: 'Newark',
  KBOS: 'Boston',
  KATL: 'Atlanta',
  KCLT: 'Charlotte'
};

const REGION_PROFILES = {
  caribbean: {
    name: 'Caribbean / Eastern Caribbean',
    airlines: [
      { call: 'LIAT', spoken: 'Lee At', weight: 12, commercial: true },
      { call: 'BWA', spoken: 'Caribbean Airlines', weight: 9, commercial: true },
      { call: 'IWY', spoken: 'InterCaribbean', weight: 8, commercial: true },
      { call: 'WIA', spoken: 'Win Air', weight: 7, commercial: true },
      { call: 'SVG', spoken: 'SVG Air', weight: 6, commercial: false },
      { call: 'TJB', spoken: 'Tradewind', weight: 5, commercial: false },
      { call: 'JBU', spoken: 'JetBlue', weight: 4, commercial: true },
      { call: 'AAL', spoken: 'American', weight: 3, commercial: true },
      { call: 'DAL', spoken: 'Delta', weight: 2, commercial: true },
      { call: 'UAL', spoken: 'United', weight: 2, commercial: true },
      { call: 'N', spoken: 'November', weight: 5, commercial: false }
    ],
    fixes: ['ANU', 'SKB', 'GABAR', 'DANDE', 'VEDAS', 'SJU', 'UDGEL', 'POPOS', 'BQN', 'STT'],
    airports: ['TKPK', 'TAPA', 'TJSJ', 'TFFR', 'TFFF', 'TBPB', 'TTPP', 'TNCM', 'TIST', 'TISX', 'TGPY', 'TVSA', 'TDPD', 'MDPC', 'MDSD', 'MKJP']
  },

  default: {
    name: 'Generic IFR',
    airlines: [
      { call: 'AAL', spoken: 'American', weight: 4, commercial: true },
      { call: 'DAL', spoken: 'Delta', weight: 4, commercial: true },
      { call: 'UAL', spoken: 'United', weight: 4, commercial: true },
      { call: 'JBU', spoken: 'JetBlue', weight: 4, commercial: true },
      { call: 'SWA', spoken: 'Southwest', weight: 3, commercial: true },
      { call: 'N', spoken: 'November', weight: 3, commercial: false }
    ],
    fixes: ['DCT', 'VOR', 'WPT'],
    airports: ['KMIA', 'KMCO', 'KJFK', 'KEWR', 'KBOS', 'KATL', 'KCLT']
  }
};

const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'niner'];
const activeLoops = new Map();
const aircraftByGuild = new Map();

export function startDiscordTrafficLoop({
  guildId,
  sessionId,
  speakToGuild,
  getSession
}) {
  if (!guildId || !sessionId || typeof speakToGuild !== 'function' || typeof getSession !== 'function') {
    console.warn('[DiscordTraffic] Cannot start loop. Missing guildId/sessionId/speakToGuild/getSession.');
    return { ok: false, reason: 'missing_args' };
  }

  const existing = activeLoops.get(guildId);

  if (existing?.sessionId === sessionId && existing?.timer) {
    console.log(`[DiscordTraffic] Auto traffic already running for guild ${guildId}, session ${sessionId}`);
    return { ok: true, alreadyRunning: true };
  }

  stopDiscordTrafficLoop(guildId);

  const session = getSession(sessionId);

  if (!session) {
    console.warn(`[DiscordTraffic] Cannot start loop. Session not found: ${sessionId}`);
    return { ok: false, reason: 'session_not_found' };
  }

  if (!shouldRunDiscordTraffic(session)) {
    console.log('[DiscordTraffic] Auto traffic disabled by env/session density.');
    return { ok: false, reason: 'disabled' };
  }

  const region = detectRegion(session);
  const regionName = (REGION_PROFILES[region] || REGION_PROFILES.default).name;

  console.log(`[DiscordTraffic] Auto regional traffic started for ${session.callsign || sessionId}`);
  console.log(`[DiscordTraffic] REGION=${regionName}, guild=${guildId}, session=${sessionId}, density=${session.trafficDensity || process.env.TRAFFIC_DENSITY_DEFAULT || 2}`);

  const state = {
    guildId,
    sessionId,
    speakToGuild,
    getSession,
    timer: null,
    busy: false,
    stopped: false,
    startedAt: Date.now(),
    count: 0,
    minUserQuietMs: Number(process.env.DISCORD_TRAFFIC_USER_QUIET_MS || 9000),
    pendingExchange: null
  };

  activeLoops.set(guildId, state);
  seedAircraftWorld(guildId, session);

  const firstDelay = randomInt(18000, 30000);
  state.timer = setTimeout(() => runTrafficTick(guildId), firstDelay);

  console.log(`[DiscordTraffic] First automatic traffic in ${Math.round(firstDelay / 1000)} seconds`);

  return { ok: true, sessionId, guildId, firstDelay };
}

export function stopDiscordTrafficLoop(guildId) {
  const state = activeLoops.get(guildId);

  if (!state) {
    return { ok: true, stopped: false };
  }

  state.stopped = true;

  if (state.timer) clearTimeout(state.timer);

  activeLoops.delete(guildId);
  aircraftByGuild.delete(guildId);

  console.log(`[DiscordTraffic] Auto traffic stopped for guild ${guildId}`);

  return { ok: true, stopped: true };
}

export function getDiscordTrafficLoopStatus(guildId) {
  const state = activeLoops.get(guildId);
  const aircraft = aircraftByGuild.get(guildId) || [];

  if (!state) {
    return { running: false, aircraft: aircraft.length };
  }

  return {
    running: true,
    guildId: state.guildId,
    sessionId: state.sessionId,
    busy: state.busy,
    startedAt: state.startedAt,
    count: state.count,
    pendingExchange: Boolean(state.pendingExchange),
    aircraft: aircraft.length
  };
}

async function runTrafficTick(guildId) {
  const state = activeLoops.get(guildId);
  if (!state || state.stopped) return;

  try {
    const session = state.getSession(state.sessionId);

    if (!session) {
      console.warn(`[DiscordTraffic] Session vanished. Stopping loop for guild ${guildId}`);
      stopDiscordTrafficLoop(guildId);
      return;
    }

    if (!shouldRunDiscordTraffic(session)) {
      console.log(`[DiscordTraffic] Traffic disabled during session. Stopping loop for guild ${guildId}`);
      stopDiscordTrafficLoop(guildId);
      return;
    }

    if (state.busy || state.pendingExchange) {
      console.log('[DiscordTraffic] Existing AI exchange still pending. Delaying traffic.');
      scheduleNextTrafficTick(state, session, randomInt(7000, 13000));
      return;
    }

    if (isRadioBusy(guildId, state.minUserQuietMs)) {
      console.log('[DiscordTraffic] Hard radio lock active. User/ATC busy, delaying AI pilot.');
      scheduleNextTrafficTick(state, session, randomInt(6000, 12000));
      return;
    }

    state.busy = true;

    const tx = createRegionalTrafficTransmission(session, guildId);
    state.pendingExchange = tx;

    await waitForClearRadio(guildId, {
      quietMs: state.minUserQuietMs,
      pollMs: 250,
      maxWaitMs: 60000,
      logPrefix: '[DiscordTraffic]'
    });

    // v3 final guard: do not even log/start the AI pilot if the user keyed up at the last second.
    if (isRadioBusy(guildId, 500)) {
      console.log('[DiscordTraffic] Final PTT guard caught busy radio before AI pilot. Holding exchange.');
      state.busy = false;
      state.pendingExchange = null;
      scheduleNextTrafficTick(state, session, randomInt(6000, 12000));
      return;
    }

    console.log(`[DiscordTraffic] PILOT: ${tx.pilotText}`);
    const pilotResult = await speakWithRadioLock({
      guildId,
      role: 'traffic',
      text: tx.pilotText,
      speakToGuild: state.speakToGuild,
      quietMsBefore: state.minUserQuietMs,
      maxWaitMs: 60000
    });

    if (!pilotResult?.ok) {
      console.warn('[DiscordTraffic] Pilot traffic audio failed or bot not joined. Ending exchange.');
      state.busy = false;
      state.pendingExchange = null;
      scheduleNextTrafficTick(state, session);
      return;
    }

    await wait(randomInt(2500, 4200));

    await waitForClearRadio(guildId, {
      quietMs: 2200,
      pollMs: 250,
      maxWaitMs: 60000,
      logPrefix: '[DiscordTraffic]'
    });

    console.log(`[DiscordTraffic] ATC: ${tx.atcText}`);
    await speakWithRadioLock({
      guildId,
      role: 'atc',
      text: tx.atcText,
      speakToGuild: state.speakToGuild,
      quietMsBefore: 2200,
      maxWaitMs: 60000
    });

    if (tx.readbackText) {
      await wait(randomInt(3000, 5000));

      await waitForClearRadio(guildId, {
        quietMs: 1800,
        pollMs: 250,
        maxWaitMs: 60000,
        logPrefix: '[DiscordTraffic]'
      });

      console.log(`[DiscordTraffic] READBACK: ${tx.readbackText}`);
      await speakWithRadioLock({
        guildId,
        role: 'traffic',
        text: tx.readbackText,
        speakToGuild: state.speakToGuild,
        quietMsBefore: 1800,
        maxWaitMs: 60000
      });
    }

    advanceTrafficAircraft(guildId, tx.aircraftId, tx.nextPhase);

    state.count += 1;
    state.busy = false;
    state.pendingExchange = null;

    scheduleNextTrafficTick(state, session);
  } catch (err) {
    console.warn('[DiscordTraffic] Tick failed:', err?.stack || err?.message || err);

    state.busy = false;
    state.pendingExchange = null;

    const session = state.getSession(state.sessionId);
    scheduleNextTrafficTick(state, session || {}, randomInt(15000, 25000));
  }
}

function scheduleNextTrafficTick(state, session, forcedDelay = null) {
  if (!state || state.stopped) return;

  const delay = forcedDelay ?? getTrafficLoopIntervalMs(session);
  state.timer = setTimeout(() => runTrafficTick(state.guildId), delay);

  console.log(`[DiscordTraffic] Next automatic traffic in ${Math.round(delay / 1000)} seconds`);
}

function seedAircraftWorld(guildId, session = {}) {
  const region = detectRegion(session);
  const profile = REGION_PROFILES[region] || REGION_PROFILES.default;
  const density = normalizeDensity(session?.trafficDensity ?? process.env.TRAFFIC_DENSITY_DEFAULT ?? 2);
  const count = Math.max(8, Math.min(40, 8 + density * 5));
  const aircraft = [];

  const userDeparture = String(session.departure || session.origin || 'TAPA').toUpperCase();
  const userArrival = String(session.arrival || session.destination || 'TKPK').toUpperCase();
  const sessionPhase = normalizePhase(session.phase || 'preflight');

  for (let i = 0; i < count; i += 1) {
    const callsign = createRegionalCallsign(profile);
    const isVfr = !callsign.commercial && Math.random() < 0.65;

    const departure = i % 3 === 0 ? userDeparture : pick(profile.airports);
    const arrival = isVfr ? departure : pickDifferentAirport(profile.airports, departure) || userArrival;

    aircraft.push({
      id: `${callsign.airline}${callsign.number}-${i}`,
      callsign,
      flightRules: isVfr ? 'VFR' : 'IFR',
      aircraftType: isVfr ? pick(['Cessna 172', 'Piper Archer', 'Cessna 208']) : pick(['AT72', 'E145', 'A320', 'B738']),
      origin: departure,
      destination: arrival,
      runway: normalizeRunway(session.depRunway || session.runway || '07'),
      squawk: randomSquawk(),
      phase: pickInitialPhase(sessionPhase),
      altitude: 0,
      assignedAltitude: 6000,
      cruiseAltitude: Number(session.cruise || 13000) || 13000,
      route: buildTrafficRoute(profile),
      nextFixIndex: 0
    });
  }

  aircraftByGuild.set(guildId, aircraft);
}

export function createRegionalTrafficTransmission(session = {}, guildId = null) {
  const region = detectRegion(session);
  const profile = REGION_PROFILES[region] || REGION_PROFILES.default;
  const runway = normalizeRunway(session?.assigned?.runway || session?.runway || session?.depRunway || guessRunway(session) || '07');
  const controller = getController(session);
  const userPhase = normalizePhase(session?.phase || session?.telemetry?.phase || session?.virtualPhase || 'preflight');

  let aircraft = null;

  if (guildId) {
    const world = aircraftByGuild.get(guildId) || [];
    aircraft = pickAircraftForFrequency(world, userPhase);
  }

  if (!aircraft) {
    const callsign = createRegionalCallsign(profile);

    aircraft = {
      id: `${callsign.airline}${callsign.number}-${Date.now()}`,
      callsign,
      flightRules: callsign.commercial ? 'IFR' : 'VFR',
      aircraftType: callsign.commercial ? 'airliner' : 'Cessna 172',
      origin: String(session.departure || session.origin || 'TAPA').toUpperCase(),
      destination: String(session.arrival || session.destination || 'TKPK').toUpperCase(),
      runway,
      squawk: randomSquawk(),
      phase: pickInitialPhase(userPhase),
      altitude: 0,
      assignedAltitude: 6000,
      cruiseAltitude: Number(session.cruise || 13000) || 13000,
      route: profile.fixes || [],
      nextFixIndex: 0
    };
  }

  const fix = aircraft.route?.[aircraft.nextFixIndex] || pick(profile.fixes);
  const altitude = pickAltitudeForAircraft(aircraft, userPhase, session);
  const scenario = scenarioFromAircraftPhase(aircraft.phase, userPhase);

  const exchange = buildExchange({
    scenario,
    aircraft,
    callsign: aircraft.callsign,
    runway: aircraft.runway || runway,
    controller,
    phase: aircraft.phase,
    departure: aircraft.origin,
    arrival: aircraft.destination,
    fix,
    altitude,
    flightRules: aircraft.flightRules,
    aircraftType: aircraft.aircraftType
  });

  return {
    type: 'discord_regional_traffic',
    region,
    regionName: profile.name,
    controller,
    aircraftId: aircraft.id,
    callsign: aircraft.callsign.spokenFull,
    pilotText: cleanTrafficPhrase(exchange.pilotText),
    atcText: cleanTrafficPhrase(exchange.atcText),
    readbackText: cleanTrafficPhrase(exchange.readbackText || ''),
    scenario,
    phase: aircraft.phase,
    nextPhase: exchange.nextPhase || nextPhaseFor(aircraft.phase),
    runway: aircraft.runway || runway,
    departure: aircraft.origin,
    arrival: aircraft.destination,
    fix,
    altitude,
    emotion: exchange.emotion,
    createdAt: Date.now()
  };
}

function buildExchange(ctx) {
  const {
    scenario,
    aircraft,
    callsign,
    runway,
    controller,
    departure,
    arrival,
    fix,
    altitude,
    flightRules,
    aircraftType
  } = ctx;

  const freq = controller.frequency || '118.70';
  const destName = speakAirport(arrival);
  const depName = speakAirport(departure);
  const isVfr = flightRules === 'VFR';

  if (isVfr) {
    return buildVfrExchange({
      scenario,
      callsign,
      runway,
      depName,
      aircraftType
    });
  }

  if (scenario === 'clearance') {
    return {
      emotion: 'calm-clearance',
      pilotText: `${callsign.spokenFull}, request IFR clearance to ${destName}.`,
      atcText: `${callsign.spokenFull}, cleared to ${destName} as filed. Maintain ${speakAltitude(aircraft.assignedAltitude || 6000)}. Departure frequency ${speakFrequency(freq)}, squawk ${speakDigits(aircraft.squawk)}.`,
      readbackText: `Cleared to ${destName} as filed, maintain ${speakAltitude(aircraft.assignedAltitude || 6000)}, departure frequency ${speakFrequency(freq)}, squawk ${speakDigits(aircraft.squawk)}, ${callsign.spokenFull}.`,
      nextPhase: 'taxi'
    };
  }

  if (scenario === 'taxi') {
    return {
      emotion: 'ground-busy',
      pilotText: `${callsign.spokenFull}, at the ramp, request taxi.`,
      atcText: `${callsign.spokenFull}, taxi to runway ${speakRunway(runway)} via Alpha, hold short runway ${speakRunway(runway)}.`,
      readbackText: `Taxi to runway ${speakRunway(runway)} via Alpha, hold short runway ${speakRunway(runway)}, ${callsign.spokenFull}.`,
      nextPhase: 'holding_short'
    };
  }

  if (scenario === 'departure') {
    return {
      emotion: 'tower-focused',
      pilotText: `${callsign.spokenFull}, holding short runway ${speakRunway(runway)}, ready for departure.`,
      atcText: `${callsign.spokenFull}, wind zero eight zero at eight, runway ${speakRunway(runway)}, cleared for takeoff.`,
      readbackText: `Cleared for takeoff runway ${speakRunway(runway)}, ${callsign.spokenFull}.`,
      nextPhase: 'airborne'
    };
  }

  if (scenario === 'airborne') {
    return {
      emotion: 'departure-calm',
      pilotText: `${callsign.spokenFull}, passing two thousand five hundred for ${altitude}.`,
      atcText: `${callsign.spokenFull}, radar contact. Climb and maintain ${altitude}, proceed direct ${speakFix(fix)}.`,
      readbackText: `Climb and maintain ${altitude}, direct ${speakFix(fix)}, ${callsign.spokenFull}.`,
      nextPhase: 'enroute'
    };
  }

  if (scenario === 'enroute') {
    return pick([
      {
        emotion: 'center-steady',
        pilotText: `${callsign.spokenFull}, level ${altitude}.`,
        atcText: `${callsign.spokenFull}, roger. Maintain ${altitude}. Traffic twelve o'clock, opposite direction, five miles.`,
        readbackText: `Maintain ${altitude}, looking for traffic, ${callsign.spokenFull}.`,
        nextPhase: 'enroute'
      },
      {
        emotion: 'center-direct',
        pilotText: `${callsign.spokenFull}, request direct ${speakFix(fix)}.`,
        atcText: `${callsign.spokenFull}, cleared direct ${speakFix(fix)}. Resume own navigation.`,
        readbackText: `Cleared direct ${speakFix(fix)}, ${callsign.spokenFull}.`,
        nextPhase: 'enroute'
      },
      {
        emotion: 'center-ride',
        pilotText: `${callsign.spokenFull}, light chop at ${altitude}.`,
        atcText: `${callsign.spokenFull}, ride report copied, light chop at ${altitude}. Thanks.`,
        readbackText: `Roger, ${callsign.spokenFull}.`,
        nextPhase: 'enroute'
      }
    ]);
  }

  if (scenario === 'approach') {
    return {
      emotion: 'approach-controlled',
      pilotText: `${callsign.spokenFull}, descending through one zero thousand with information Alpha.`,
      atcText: `${callsign.spokenFull}, expect runway ${speakRunway(runway)} approach. Descend and maintain six thousand.`,
      readbackText: `Descend and maintain six thousand, expect runway ${speakRunway(runway)} approach, ${callsign.spokenFull}.`,
      nextPhase: 'final'
    };
  }

  if (scenario === 'landing') {
    return {
      emotion: 'tower-final',
      pilotText: `${callsign.spokenFull}, final runway ${speakRunway(runway)}.`,
      atcText: `${callsign.spokenFull}, wind zero eight zero at eight, runway ${speakRunway(runway)}, cleared to land.`,
      readbackText: `Cleared to land runway ${speakRunway(runway)}, ${callsign.spokenFull}.`,
      nextPhase: 'taxi_in'
    };
  }

  return {
    emotion: 'generic',
    pilotText: `${callsign.spokenFull}, request.`,
    atcText: `${callsign.spokenFull}, say request.`,
    readbackText: '',
    nextPhase: aircraft.phase
  };
}

function buildVfrExchange({
  scenario,
  callsign,
  runway,
  depName,
  aircraftType
}) {
  const aircraftSpoken = speakAircraftType(aircraftType);

  if (scenario === 'departure') {
    return {
      emotion: 'vfr-tower',
      pilotText: `${callsign.spokenFull}, holding short runway ${speakRunway(runway)}, ready for V F R departure.`,
      atcText: `${callsign.spokenFull}, runway ${speakRunway(runway)}, cleared for takeoff. Maintain V F R at or below two thousand five hundred.`,
      readbackText: `Cleared for takeoff runway ${speakRunway(runway)}, maintain V F R, ${callsign.spokenFull}.`,
      nextPhase: 'airborne'
    };
  }

  if (scenario === 'airborne' || scenario === 'enroute') {
    return {
      emotion: 'vfr-departure',
      pilotText: `${callsign.spokenFull}, off runway ${speakRunway(runway)}, climbing V F R.`,
      atcText: `${callsign.spokenFull}, radar contact. Maintain V F R. Traffic advisories available on this frequency.`,
      readbackText: `Maintain V F R, ${callsign.spokenFull}.`,
      nextPhase: 'enroute'
    };
  }

  return {
    emotion: 'vfr-ground',
    pilotText: `${callsign.spokenFull}, request taxi for V F R departure from ${depName}, ${aircraftSpoken}, at or below two thousand five hundred, request flight following.`,
    atcText: `${callsign.spokenFull}, taxi to runway ${speakRunway(runway)} via Alpha, hold short runway ${speakRunway(runway)}.`,
    readbackText: `Taxi to runway ${speakRunway(runway)} via Alpha, hold short runway ${speakRunway(runway)}, ${callsign.spokenFull}.`,
    nextPhase: 'holding_short'
  };
}

function pickAircraftForFrequency(world, userPhase) {
  const candidates = world.filter(a => isAircraftPhaseCompatible(a.phase, userPhase));
  if (candidates.length) return pick(candidates);
  return world[0] || null;
}

function isAircraftPhaseCompatible(aircraftPhase, userPhase) {
  if (/ground|taxi|preflight|clearance/.test(userPhase)) {
    return /clearance|taxi|push|holding_short|taxi_in/.test(aircraftPhase);
  }

  if (/tower|takeoff|landing|final/.test(userPhase)) {
    return /holding_short|final|taxi_in/.test(aircraftPhase);
  }

  if (/departure|climb|airborne/.test(userPhase)) {
    return /airborne|enroute/.test(aircraftPhase);
  }

  if (/center|cruise|enroute/.test(userPhase)) {
    return /enroute|airborne/.test(aircraftPhase);
  }

  if (/approach|arrival|descent/.test(userPhase)) {
    return /approach|enroute|final/.test(aircraftPhase);
  }

  return true;
}

function advanceTrafficAircraft(guildId, aircraftId, nextPhase) {
  if (!guildId || !aircraftId || !nextPhase) return;

  const world = aircraftByGuild.get(guildId) || [];
  const aircraft = world.find(a => a.id === aircraftId);

  if (!aircraft) return;

  aircraft.phase = nextPhase;

  if (nextPhase === 'enroute' && aircraft.nextFixIndex < (aircraft.route?.length || 0) - 1) {
    aircraft.nextFixIndex += 1;
  }
}

function scenarioFromAircraftPhase(aircraftPhase, userPhase) {
  if (/clearance/.test(aircraftPhase)) return 'clearance';
  if (/taxi|push/.test(aircraftPhase)) return 'taxi';
  if (/holding_short/.test(aircraftPhase)) return 'departure';
  if (/airborne/.test(aircraftPhase)) return 'airborne';
  if (/enroute/.test(aircraftPhase)) return 'enroute';
  if (/approach/.test(aircraftPhase)) return 'approach';
  if (/final/.test(aircraftPhase)) return 'landing';
  if (/taxi_in/.test(aircraftPhase)) return 'taxi';

  return pickScenario(userPhase);
}

function nextPhaseFor(phase) {
  if (/clearance/.test(phase)) return 'taxi';
  if (/taxi|push/.test(phase)) return 'holding_short';
  if (/holding_short/.test(phase)) return 'airborne';
  if (/airborne/.test(phase)) return 'enroute';
  if (/enroute/.test(phase)) return 'approach';
  if (/approach/.test(phase)) return 'final';
  if (/final/.test(phase)) return 'taxi_in';
  if (/taxi_in/.test(phase)) return 'complete';
  return 'enroute';
}

function pickInitialPhase(userPhase) {
  if (/ground|preflight|clearance/.test(userPhase)) {
    return weightedPick([
      ['clearance', 2],
      ['taxi', 5],
      ['holding_short', 1],
      ['taxi_in', 1]
    ]);
  }

  if (/tower|takeoff/.test(userPhase)) {
    return weightedPick([
      ['holding_short', 5],
      ['final', 3]
    ]);
  }

  if (/departure|climb|airborne/.test(userPhase)) {
    return weightedPick([
      ['airborne', 6],
      ['enroute', 2]
    ]);
  }

  if (/center|cruise|enroute/.test(userPhase)) {
    return weightedPick([
      ['enroute', 7],
      ['airborne', 1],
      ['approach', 1]
    ]);
  }

  if (/approach|descent|arrival/.test(userPhase)) {
    return weightedPick([
      ['approach', 5],
      ['final', 2],
      ['enroute', 1]
    ]);
  }

  return weightedPick([
    ['taxi', 2],
    ['holding_short', 2],
    ['enroute', 2],
    ['approach', 1]
  ]);
}

function pickScenario(phase) {
  if (/preflight|clearance|ground|prep/.test(phase)) return weightedPick([['clearance', 2], ['taxi', 5], ['departure', 1]]);
  if (/taxi|push|ramp/.test(phase)) return weightedPick([['taxi', 5], ['departure', 3]]);
  if (/takeoff|departure|climb|airborne/.test(phase)) return weightedPick([['departure', 2], ['airborne', 5], ['enroute', 1]]);
  if (/cruise|enroute|center/.test(phase)) return weightedPick([['enroute', 6], ['approach', 1], ['airborne', 1]]);
  if (/descent|approach|arrival/.test(phase)) return weightedPick([['approach', 6], ['enroute', 1], ['landing', 2]]);
  if (/landing|final|tower/.test(phase)) return weightedPick([['landing', 5], ['approach', 2], ['departure', 2]]);
  return weightedPick([['taxi', 2], ['departure', 2], ['enroute', 2], ['approach', 1]]);
}

function buildTrafficRoute(profile) {
  const fixes = profile.fixes || [];
  const route = [];
  if (fixes.length) {
    route.push(pick(fixes));
    route.push(pick(fixes));
  }
  return [...new Set(route)].filter(Boolean);
}

export function getTrafficLoopIntervalMs(session = {}) {
  const density = normalizeDensity(session?.trafficDensity ?? process.env.TRAFFIC_DENSITY_DEFAULT ?? 2);

  if (density >= 6) return randomInt(90000, 150000);
  if (density >= 5) return randomInt(95000, 160000);
  if (density >= 4) return randomInt(100000, 175000);
  if (density >= 3) return randomInt(90000, 160000);
  if (density >= 2) return randomInt(110000, 180000);
  return randomInt(150000, 240000);
}

export function shouldRunDiscordTraffic(session = {}) {
  const env = String(process.env.DISCORD_TRAFFIC_AUTO || 'true').toLowerCase();
  if (env === 'false' || env === 'off' || env === '0') return false;
  return normalizeDensity(session?.trafficDensity ?? process.env.TRAFFIC_DENSITY_DEFAULT ?? 2) > 0;
}

function getController(session) {
  const c = session?.controller || session?.telemetry?.controller || {};

  if (typeof c === 'string') return { name: c, frequency: session?.frequency || '118.70' };

  const phase = normalizePhase(session?.phase || session?.telemetry?.phase || '');
  let fallbackName = 'SkyEcho Center';
  let fallbackFreq = '118.70';

  if (/preflight|clearance|ground|taxi|ramp/.test(phase)) {
    fallbackName = 'Bradshaw Ground';
    fallbackFreq = '121.90';
  } else if (/departure|climb|airborne/.test(phase)) {
    fallbackName = 'Bradshaw Departure';
    fallbackFreq = '119.60';
  } else if (/approach|arrival|descent/.test(phase)) {
    fallbackName = 'Approach';
    fallbackFreq = '119.60';
  } else if (/landing|tower|final/.test(phase)) {
    fallbackName = 'Bradshaw Tower';
    fallbackFreq = '118.70';
  }

  return {
    name: c.name || fallbackName,
    frequency: c.frequency || session?.frequency || fallbackFreq
  };
}

function detectRegion(session) {
  const text = [session?.departure, session?.arrival, session?.origin, session?.destination, session?.route]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();

  for (const icao of CARIBBEAN_AIRPORTS) {
    if (text.includes(icao)) return 'caribbean';
  }

  return process.env.TRAFFIC_REGION || 'default';
}

function createRegionalCallsign(profile) {
  const airline = weightedPick(profile.airlines.map(a => [a, a.weight || 1]));

  if (airline.call === 'N') {
    const n = `${randomInt(1000, 9999)}`;
    return {
      airline: airline.call,
      number: n,
      commercial: false,
      spokenFull: `${airline.spoken} ${speakDigits(n)}`
    };
  }

  const number = String(randomInt(102, 899));

  return {
    airline: airline.call,
    number,
    commercial: Boolean(airline.commercial),
    spokenFull: `${airline.spoken} ${speakDigits(number)}`
  };
}

function pickAltitudeForAircraft(aircraft, userPhase, session) {
  if (/approach|descent|arrival/.test(userPhase)) return pick(['six thousand', 'eight thousand', 'one zero thousand']);
  if (/departure|climb|airborne/.test(userPhase)) return pick(['six thousand', 'eight thousand', 'one two thousand']);
  if (aircraft?.cruiseAltitude) return speakAltitude(aircraft.cruiseAltitude);
  return pick(['flight level one six zero', 'flight level two one zero', 'one six thousand']);
}

function guessRunway(session) {
  const s = JSON.stringify(session || {}).toUpperCase();
  if (s.includes('RWY 10') || s.includes('RUNWAY 10')) return '10';
  if (s.includes('RWY 07') || s.includes('RUNWAY 07')) return '07';
  if (s.includes('RWY 17R') || s.includes('RUNWAY 17R')) return '17R';
  return '07';
}

function normalizePhase(phase) {
  return String(phase || '').toLowerCase().replace(/_/g, '-');
}

function normalizeRunway(runway) {
  const r = String(runway || '07').toUpperCase().replace(/^RWY\s*/, '').replace(/[^\dLRC]/g, '');
  const m = r.match(/\d+/)?.[0] || '07';
  const suffix = r.match(/[LRC]$/)?.[0] || '';
  return `${m.padStart(2, '0')}${suffix}`;
}

function speakAirport(icao = '') {
  const ident = String(icao || '').toUpperCase().trim();
  return AIRPORT_NAMES[ident] || speakIcao(ident);
}

function speakAircraftType(type = '') {
  const raw = String(type || '').toUpperCase();
  if (raw.includes('172')) return 'Cessna one seventy two';
  if (raw.includes('208')) return 'Cessna two zero eight';
  if (raw.includes('ARCHER')) return 'Piper Archer';
  return String(type || 'aircraft');
}

function speakAltitude(alt) {
  const n = Number(String(alt).replace(/[^\d]/g, ''));
  if (!Number.isFinite(n)) return String(alt);
  if (n >= 18000) return `flight level ${speakDigits(String(Math.round(n / 100)))}`;
  if (n % 1000 === 0) {
    const thousands = n / 1000;
    if (thousands < 10) return `${DIGITS[thousands]} thousand`;
    return `${speakDigits(String(thousands))} thousand`;
  }
  return speakDigits(String(n));
}

function speakIcao(icao = '') {
  const NATO = {
    A: 'Alpha', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo', F: 'Foxtrot',
    G: 'Golf', H: 'Hotel', I: 'India', J: 'Juliet', K: 'Kilo', L: 'Lima',
    M: 'Mike', N: 'November', O: 'Oscar', P: 'Papa', Q: 'Quebec', R: 'Romeo',
    S: 'Sierra', T: 'Tango', U: 'Uniform', V: 'Victor', W: 'Whiskey',
    X: 'X-ray', Y: 'Yankee', Z: 'Zulu'
  };
  return String(icao).toUpperCase().split('').map(ch => NATO[ch] || ch).join(' ');
}

function speakFix(fix = '') {
  return String(fix || '').toUpperCase().split('').join(' ');
}

function speakRunway(runway) {
  const r = normalizeRunway(runway);
  const digits = r.match(/\d+/)?.[0] || '07';
  const suffix = r.match(/[LRC]$/)?.[0] || '';
  const suffixWord = suffix === 'L' ? ' left' : suffix === 'R' ? ' right' : suffix === 'C' ? ' center' : '';
  return `${speakDigits(digits)}${suffixWord}`;
}

function speakDigits(value) {
  return String(value).split('').map(d => DIGITS[Number(d)] || d).join(' ');
}

function speakFrequency(freq = '') {
  return String(freq).replace('.', ' decimal ').replace(/\b9\b/g, 'niner');
}

function randomSquawk() {
  let code = '';
  while (code.length < 4) code += String(randomInt(0, 7));
  return code;
}

function normalizeDensity(value) {
  const v = String(value ?? '').toLowerCase().trim();
  if (v === 'off' || v === 'none' || v === 'false') return 0;
  if (v === 'light') return 1;
  if (v === 'medium') return 2;
  if (v === 'busy') return 3;
  if (v === 'heavy') return 4;
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  return 2;
}

function cleanTrafficPhrase(text = '') {
  let out = String(text || '').trim();
  out = out.replace(/\bVictor Foxtrot Romeo\b/gi, 'V F R');
  out = out.replace(/\bVFR\b/g, 'V F R');
  out = out.replace(/,\s*([A-Za-z ]+\d{2,4})\.\s*,\s*\1\./gi, ', $1.');
  out = out.replace(/,\s*([A-Za-z ]+\d{2,4})\s*,\s*\1\b/gi, ', $1');
  out = out.replace(/\s+/g, ' ');
  out = out.replace(/\s+\./g, '.');
  out = out.replace(/,\s*,/g, ',');
  return out.trim();
}

function pickDifferentAirport(list, notThis) {
  const clean = (list || []).filter(x => x && x !== notThis);
  if (!clean.length) return notThis || 'TAPA';
  return pick(clean);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function randomInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function weightedPick(weighted) {
  const total = weighted.reduce((sum, item) => sum + Number(item[1] || 1), 0);
  let roll = Math.random() * total;

  for (const [value, weight] of weighted) {
    roll -= Number(weight || 1);
    if (roll <= 0) return value;
  }

  return weighted[0][0];
}
