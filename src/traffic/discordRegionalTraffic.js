// src/traffic/discordRegionalTraffic.js
// SkyEcho Discord Regional AI Traffic
// Safer radio-queue version: one AI traffic exchange must finish
// before another AI aircraft can call.

const CARIBBEAN_AIRPORTS = new Set([
  'TKPK',
  'TAPA',
  'TJSJ',
  'TNCM',
  'TFFR',
  'TFFF',
  'TBPB',
  'TTPP',
  'TIST',
  'TISX',
  'TGPY',
  'TVSA',
  'TVSC',
  'TVSM',
  'TDPD',
  'MDPC',
  'MDSD',
  'MKJP',
  'MWCR',
  'MYNN'
]);

const AIRPORT_NAMES = {
  TKPK: 'Robert L. Bradshaw',
  TAPA: 'V.C. Bird',
  TJSJ: 'San Juan',
  TNCM: 'Princess Juliana',
  TFFR: 'Pointe-a-Pitre',
  TFFF: 'Martinique',
  TBPB: 'Grantley Adams',
  TTPP: 'Piarco',
  TIST: 'St. Thomas',
  TISX: 'St. Croix',
  TGPY: 'Maurice Bishop',
  TVSA: 'Argyle',
  TVSC: 'Canouan',
  TVSM: 'Mustique',
  TDPD: 'Douglas Charles',
  MDPC: 'Punta Cana',
  MDSD: 'Santo Domingo',
  MKJP: 'Kingston',
  MWCR: 'Owen Roberts',
  MYNN: 'Nassau',
  KMIA: 'Miami',
  KMCO: 'Orlando',
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
      { call: 'LIAT', spoken: 'Lee At', weight: 12 },
      { call: 'BWA', spoken: 'Caribbean Airlines', weight: 9 },
      { call: 'IWY', spoken: 'InterCaribbean', weight: 8 },
      { call: 'WIA', spoken: 'Win Air', weight: 7 },
      { call: 'SVG', spoken: 'SVG Air', weight: 6 },
      { call: 'TJB', spoken: 'Tradewind', weight: 5 },
      { call: 'JBU', spoken: 'JetBlue', weight: 4 },
      { call: 'AAL', spoken: 'American', weight: 3 },
      { call: 'DAL', spoken: 'Delta', weight: 2 },
      { call: 'UAL', spoken: 'United', weight: 2 },
      { call: 'N', spoken: 'November', weight: 4 }
    ],
    fixes: ['ANU', 'SKB', 'GABAR', 'DANDE', 'VEDAS', 'SJU', 'UDGEL', 'POPOS', 'BQN', 'STT'],
    airports: ['TKPK', 'TAPA', 'TJSJ', 'TFFR', 'TFFF', 'TBPB', 'TTPP', 'TNCM', 'TIST', 'TISX', 'TGPY', 'TVSA', 'TDPD', 'MDPC', 'MDSD', 'MKJP']
  },

  default: {
    name: 'Generic IFR',
    airlines: [
      { call: 'AAL', spoken: 'American', weight: 4 },
      { call: 'DAL', spoken: 'Delta', weight: 4 },
      { call: 'UAL', spoken: 'United', weight: 4 },
      { call: 'JBU', spoken: 'JetBlue', weight: 4 },
      { call: 'N', spoken: 'November', weight: 3 }
    ],
    fixes: ['DCT', 'VOR', 'WPT'],
    airports: ['KMIA', 'KMCO', 'KJFK', 'KEWR', 'KBOS', 'KATL', 'KCLT']
  }
};

const DIGITS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'niner'
];

const activeLoops = new Map();

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
    lastUserActivityAt: 0,
    lastTrafficAt: 0,
    minUserQuietMs: Number(process.env.DISCORD_TRAFFIC_USER_QUIET_MS || 8500),
    minRadioGapMs: Number(process.env.DISCORD_TRAFFIC_RADIO_GAP_MS || 3500),
    pendingExchange: null
  };

  activeLoops.set(guildId, state);

  const firstDelay = randomInt(14000, 26000);
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

  if (state.timer) {
    clearTimeout(state.timer);
  }

  activeLoops.delete(guildId);

  console.log(`[DiscordTraffic] Auto traffic stopped for guild ${guildId}`);

  return { ok: true, stopped: true };
}

export function getDiscordTrafficLoopStatus(guildId) {
  const state = activeLoops.get(guildId);

  if (!state) {
    return { running: false };
  }

  return {
    running: true,
    guildId: state.guildId,
    sessionId: state.sessionId,
    busy: state.busy,
    startedAt: state.startedAt,
    count: state.count,
    pendingExchange: Boolean(state.pendingExchange)
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
      console.log('[DiscordTraffic] Frequency busy, delaying traffic transmission.');
      scheduleNextTrafficTick(state, session, randomInt(7000, 13000));
      return;
    }

    if (!radioIsQuietEnough(state)) {
      console.log('[DiscordTraffic] User/ATC recently active. Holding AI traffic.');
      scheduleNextTrafficTick(state, session, randomInt(6500, 12000));
      return;
    }

    state.busy = true;

    const tx = createRegionalTrafficTransmission(session);
    state.pendingExchange = tx;

    console.log(`[DiscordTraffic] PILOT: ${tx.pilotText}`);

    const pilotResult = await state.speakToGuild(guildId, tx.pilotText, 'traffic');

    if (!pilotResult?.ok) {
      console.warn('[DiscordTraffic] Pilot traffic audio failed or bot not joined. Ending exchange.');
      state.busy = false;
      state.pendingExchange = null;
      scheduleNextTrafficTick(state, session);
      return;
    }

    await wait(randomInt(900, 1600));

    if (!radioIsQuietEnough(state, 1200)) {
      console.log('[DiscordTraffic] User/ATC became busy before traffic ATC reply. Holding same ATC reply, not starting a new pilot.');
      await wait(randomInt(2500, 4500));
    }

    console.log(`[DiscordTraffic] ATC: ${tx.atcText}`);

    const atcResult = await state.speakToGuild(guildId, tx.atcText, 'atc');

    if (!atcResult?.ok) {
      console.warn('[DiscordTraffic] ATC traffic audio failed.');
    }

    state.count += 1;
    state.lastTrafficAt = Date.now();
    state.busy = false;
    state.pendingExchange = null;

    scheduleNextTrafficTick(state, session);
  } catch (err) {
    console.warn('[DiscordTraffic] Tick failed:', err?.stack || err?.message || err);

    state.busy = false;
    state.pendingExchange = null;

    const session = state.getSession(state.sessionId);
    scheduleNextTrafficTick(state, session || {}, randomInt(12000, 22000));
  }
}

function radioIsQuietEnough(state, overrideQuietMs = null) {
  const now = Date.now();
  const quietMs = overrideQuietMs ?? state.minUserQuietMs;
  const radioGap = state.minRadioGapMs;

  if (now - state.lastTrafficAt < radioGap) return false;

  return true;
}

function scheduleNextTrafficTick(state, session, forcedDelay = null) {
  if (!state || state.stopped) return;

  const delay = forcedDelay ?? getTrafficLoopIntervalMs(session);

  state.timer = setTimeout(() => runTrafficTick(state.guildId), delay);

  console.log(`[DiscordTraffic] Next automatic traffic in ${Math.round(delay / 1000)} seconds`);
}

export function createRegionalTrafficTransmission(session = {}) {
  const region = detectRegion(session);
  const profile = REGION_PROFILES[region] || REGION_PROFILES.default;

  const runway = normalizeRunway(
    session?.assigned?.runway ||
    session?.runway ||
    session?.depRunway ||
    guessRunway(session) ||
    '07'
  );

  const controller = getController(session);

  const phase = normalizePhase(
    session?.phase ||
    session?.telemetry?.phase ||
    session?.virtualPhase ||
    'preflight'
  );

  const userDeparture = String(
    session?.departure ||
    session?.origin ||
    firstIcao(session?.route) ||
    'TAPA'
  ).toUpperCase();

  const userArrival = String(
    session?.arrival ||
    session?.destination ||
    lastIcao(session?.route) ||
    'TKPK'
  ).toUpperCase();

  const callsign = createRegionalCallsign(profile);

  const trafficPlan = createTrafficPlan({
    profile,
    region,
    userDeparture,
    userArrival,
    callsign,
    phase
  });

  const fix = pick(profile.fixes);
  const altitude = pickAltitudeForPhase(phase, session);
  const scenario = pickScenario(phase);

  const exchange = buildExchange({
    scenario,
    callsign,
    runway,
    controller,
    phase,
    departure: trafficPlan.departure,
    arrival: trafficPlan.arrival,
    fix,
    altitude,
    flightRules: trafficPlan.flightRules,
    aircraftType: trafficPlan.aircraftType
  });

  return {
    type: 'discord_regional_traffic',
    region,
    regionName: profile.name,
    controller,
    callsign: callsign.spokenFull,
    pilotText: cleanTrafficPhrase(exchange.pilotText),
    atcText: cleanTrafficPhrase(exchange.atcText),
    scenario,
    phase,
    runway,
    departure: trafficPlan.departure,
    arrival: trafficPlan.arrival,
    fix,
    altitude,
    emotion: exchange.emotion,
    createdAt: Date.now()
  };
}

function createTrafficPlan({
  profile,
  region,
  userDeparture,
  userArrival,
  callsign,
  phase
}) {
  const airports = profile.airports || REGION_PROFILES.default.airports;

  let departure = userDeparture;
  let arrival = userArrival;

  const isGroundLike = /preflight|clearance|ground|taxi|ramp/.test(phase);
  const isLocalVfrCandidate = callsign.airline === 'N';

  if (isGroundLike) {
    departure = userDeparture;
  } else if (/approach|arrival|descent|landing|final/.test(phase)) {
    arrival = userArrival;
    departure = pickDifferentAirport(airports, arrival);
  } else {
    departure = pickDifferentAirport(airports, userArrival);
    arrival = pickDifferentAirport(airports, departure);
  }

  if (isLocalVfrCandidate) {
    arrival = departure;
  }

  const flightRules = isLocalVfrCandidate ? 'VFR' : 'IFR';

  return {
    departure,
    arrival,
    flightRules,
    aircraftType: isLocalVfrCandidate ? pick(['Cessna 172', 'Piper Archer', 'Cessna 208']) : 'airliner'
  };
}

function buildExchange(ctx) {
  const {
    scenario,
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
      departure,
      depName,
      aircraftType
    });
  }

  const variants = {
    clearance: [
      {
        emotion: 'calm-clearance',
        pilotText: `${callsign.spokenFull}, request IFR clearance to ${destName}.`,
        atcText: `${callsign.spokenFull}, cleared to ${destName} as filed. Maintain ${altitude}. Departure frequency ${speakFrequency(freq)}, squawk ${randomSquawkSpoken()}.`
      }
    ],

    taxi: [
      {
        emotion: 'ground-busy',
        pilotText: `${callsign.spokenFull}, ready to taxi.`,
        atcText: `${callsign.spokenFull}, taxi to runway ${speakRunway(runway)} via Alpha, hold short runway ${speakRunway(runway)}.`
      },
      {
        emotion: 'ground-efficient',
        pilotText: `${callsign.spokenFull}, at the ramp, request taxi.`,
        atcText: `${callsign.spokenFull}, taxi runway ${speakRunway(runway)} via Alpha. Give way to traffic crossing left to right.`
      }
    ],

    departure: [
      {
        emotion: 'tower-focused',
        pilotText: `${callsign.spokenFull}, holding short runway ${speakRunway(runway)}, ready for departure.`,
        atcText: `${callsign.spokenFull}, wind zero eight zero at eight, runway ${speakRunway(runway)}, cleared for takeoff.`
      },
      {
        emotion: 'tower-alert',
        pilotText: `${callsign.spokenFull}, ready for departure runway ${speakRunway(runway)}.`,
        atcText: `${callsign.spokenFull}, line up and wait runway ${speakRunway(runway)}, traffic short final.`
      }
    ],

    airborne: [
      {
        emotion: 'departure-calm',
        pilotText: `${callsign.spokenFull}, passing two thousand five hundred for ${altitude}.`,
        atcText: `${callsign.spokenFull}, radar contact. Climb and maintain ${altitude}, proceed direct ${speakFix(fix)}.`
      },
      {
        emotion: 'departure-vector',
        pilotText: `${callsign.spokenFull}, airborne off ${depName}, climbing through one thousand eight hundred.`,
        atcText: `${callsign.spokenFull}, radar contact. Turn right heading zero niner zero, climb and maintain ${altitude}.`
      }
    ],

    enroute: [
      {
        emotion: 'center-steady',
        pilotText: `${callsign.spokenFull}, level ${altitude}.`,
        atcText: `${callsign.spokenFull}, roger. Maintain ${altitude}. Traffic twelve o'clock, opposite direction, five miles.`
      },
      {
        emotion: 'center-traffic-advisory',
        pilotText: `${callsign.spokenFull}, request direct ${speakFix(fix)}.`,
        atcText: `${callsign.spokenFull}, cleared direct ${speakFix(fix)}. Resume own navigation.`
      }
    ],

    approach: [
      {
        emotion: 'approach-controlled',
        pilotText: `${callsign.spokenFull}, descending through one zero thousand with information Alpha.`,
        atcText: `${callsign.spokenFull}, expect runway ${speakRunway(runway)} approach. Descend and maintain six thousand.`
      },
      {
        emotion: 'approach-sequencing',
        pilotText: `${callsign.spokenFull}, inbound ${speakFix(fix)} for ${destName}.`,
        atcText: `${callsign.spokenFull}, roger. Reduce speed two one zero knots. You are number two following traffic ahead.`
      }
    ],

    landing: [
      {
        emotion: 'tower-final',
        pilotText: `${callsign.spokenFull}, final runway ${speakRunway(runway)}.`,
        atcText: `${callsign.spokenFull}, wind zero eight zero at eight, runway ${speakRunway(runway)}, cleared to land.`
      }
    ]
  };

  return pick(variants[scenario] || variants.enroute);
}

function buildVfrExchange({
  scenario,
  callsign,
  runway,
  depName,
  aircraftType
}) {
  const aircraftSpoken = speakAircraftType(aircraftType);

  const groundRequest = {
    emotion: 'vfr-ground',
    pilotText: `${callsign.spokenFull}, request taxi for V F R departure from ${depName}, ${aircraftSpoken}, at or below two thousand five hundred, request flight following.`,
    atcText: `${callsign.spokenFull}, taxi to runway ${speakRunway(runway)} via Alpha, hold short runway ${speakRunway(runway)}.`
  };

  const towerRequest = {
    emotion: 'vfr-tower',
    pilotText: `${callsign.spokenFull}, holding short runway ${speakRunway(runway)}, ready for V F R departure.`,
    atcText: `${callsign.spokenFull}, runway ${speakRunway(runway)}, cleared for takeoff. Maintain V F R at or below two thousand five hundred.`
  };

  const airborne = {
    emotion: 'vfr-departure',
    pilotText: `${callsign.spokenFull}, off runway ${speakRunway(runway)}, climbing V F R.`,
    atcText: `${callsign.spokenFull}, radar contact. Maintain V F R. Traffic advisories available on this frequency.`
  };

  if (/departure|takeoff|tower/.test(scenario)) return towerRequest;
  if (/airborne|enroute/.test(scenario)) return airborne;

  return groundRequest;
}

export function getTrafficLoopIntervalMs(session = {}) {
  const densityRaw = session?.trafficDensity ?? process.env.TRAFFIC_DENSITY_DEFAULT ?? 2;
  const density = normalizeDensity(densityRaw);

  if (density >= 6) return randomInt(26000, 47000);
  if (density >= 5) return randomInt(32000, 55000);
  if (density >= 4) return randomInt(42000, 70000);
  if (density >= 3) return randomInt(55000, 90000);
  if (density >= 2) return randomInt(80000, 130000);
  return randomInt(120000, 190000);
}

export function shouldRunDiscordTraffic(session = {}) {
  const env = String(process.env.DISCORD_TRAFFIC_AUTO || 'true').toLowerCase();

  if (env === 'false' || env === 'off' || env === '0') return false;

  const densityRaw = session?.trafficDensity ?? process.env.TRAFFIC_DENSITY_DEFAULT ?? 2;
  const density = normalizeDensity(densityRaw);

  if (density <= 0) return false;

  return true;
}

function pickScenario(phase) {
  if (/preflight|clearance|ground|prep/.test(phase)) {
    return weightedPick([
      ['clearance', 2],
      ['taxi', 5],
      ['departure', 1]
    ]);
  }

  if (/taxi|push|ramp/.test(phase)) {
    return weightedPick([
      ['taxi', 5],
      ['departure', 3]
    ]);
  }

  if (/takeoff|departure|climb|airborne/.test(phase)) {
    return weightedPick([
      ['departure', 2],
      ['airborne', 5],
      ['enroute', 1]
    ]);
  }

  if (/cruise|enroute|center/.test(phase)) {
    return weightedPick([
      ['enroute', 6],
      ['approach', 1],
      ['airborne', 1]
    ]);
  }

  if (/descent|approach|arrival/.test(phase)) {
    return weightedPick([
      ['approach', 6],
      ['enroute', 1],
      ['landing', 2]
    ]);
  }

  if (/landing|final|tower/.test(phase)) {
    return weightedPick([
      ['landing', 5],
      ['approach', 2],
      ['departure', 2]
    ]);
  }

  return weightedPick([
    ['taxi', 2],
    ['departure', 2],
    ['enroute', 2],
    ['approach', 1]
  ]);
}

function getController(session) {
  const c = session?.controller || session?.telemetry?.controller || {};

  if (typeof c === 'string') {
    return {
      name: c,
      frequency: session?.frequency || '118.70'
    };
  }

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
  const text = [
    session?.departure,
    session?.arrival,
    session?.origin,
    session?.destination,
    session?.route
  ]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();

  for (const icao of CARIBBEAN_AIRPORTS) {
    if (text.includes(icao)) return 'caribbean';
  }

  return process.env.TRAFFIC_REGION || 'default';
}

function createRegionalCallsign(profile) {
  const airline = weightedPick(profile.airlines.map(a => [a, a.weight || a.weights || 1]));

  if (airline.call === 'N') {
    const n = `${randomInt(1000, 9999)}`;

    return {
      airline: airline.call,
      number: n,
      spokenFull: `${airline.spoken} ${speakDigits(n)}`
    };
  }

  const number = String(randomInt(102, 899));

  return {
    airline: airline.call,
    number,
    spokenFull: `${airline.spoken} ${speakDigits(number)}`
  };
}

function pickAltitudeForPhase(phase, session) {
  const cruise = String(session?.cruise || session?.assigned?.initialAltitude || '').toUpperCase();

  if (cruise && /^\d+$/.test(cruise)) {
    return speakAltitude(cruise);
  }

  if (cruise.startsWith('FL')) {
    return `flight level ${speakDigits(cruise.replace('FL', ''))}`;
  }

  if (/approach|descent|arrival/.test(phase)) {
    return pick(['six thousand', 'eight thousand', 'one zero thousand']);
  }

  if (/departure|climb|airborne/.test(phase)) {
    return pick(['six thousand', 'eight thousand', 'one two thousand']);
  }

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
  const r = String(runway || '07')
    .toUpperCase()
    .replace(/^RWY\s*/, '')
    .replace(/[^\dLRC]/g, '');

  const m = r.match(/\d+/)?.[0] || '07';
  const suffix = r.match(/[LRC]$/)?.[0] || '';

  return `${m.padStart(2, '0')}${suffix}`;
}

function firstIcao(route = '') {
  return String(route).toUpperCase().match(/\b[A-Z]{4}\b/)?.[0] || null;
}

function lastIcao(route = '') {
  const all = String(route).toUpperCase().match(/\b[A-Z]{4}\b/g) || [];
  return all[all.length - 1] || null;
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

  if (n >= 18000) {
    return `flight level ${speakDigits(String(Math.round(n / 100)))}`;
  }

  if (n % 1000 === 0) {
    const thousands = n / 1000;

    if (thousands < 10) return `${DIGITS[thousands]} thousand`;

    return `${speakDigits(String(thousands))} thousand`;
  }

  return speakDigits(String(n));
}

function speakIcao(icao = '') {
  const NATO = {
    A: 'Alpha',
    B: 'Bravo',
    C: 'Charlie',
    D: 'Delta',
    E: 'Echo',
    F: 'Foxtrot',
    G: 'Golf',
    H: 'Hotel',
    I: 'India',
    J: 'Juliet',
    K: 'Kilo',
    L: 'Lima',
    M: 'Mike',
    N: 'November',
    O: 'Oscar',
    P: 'Papa',
    Q: 'Quebec',
    R: 'Romeo',
    S: 'Sierra',
    T: 'Tango',
    U: 'Uniform',
    V: 'Victor',
    W: 'Whiskey',
    X: 'X-ray',
    Y: 'Yankee',
    Z: 'Zulu'
  };

  return String(icao)
    .toUpperCase()
    .split('')
    .map(ch => NATO[ch] || ch)
    .join(' ');
}

function speakFix(fix = '') {
  return String(fix || '')
    .toUpperCase()
    .split('')
    .join(' ');
}

function speakRunway(runway) {
  const r = normalizeRunway(runway);
  const digits = r.match(/\d+/)?.[0] || '07';
  const suffix = r.match(/[LRC]$/)?.[0] || '';

  const suffixWord =
    suffix === 'L'
      ? ' left'
      : suffix === 'R'
        ? ' right'
        : suffix === 'C'
          ? ' center'
          : '';

  return `${speakDigits(digits)}${suffixWord}`;
}

function speakDigits(value) {
  return String(value)
    .split('')
    .map(d => DIGITS[Number(d)] || d)
    .join(' ');
}

function speakFrequency(freq = '') {
  return String(freq)
    .replace('.', ' decimal ')
    .replace(/\b9\b/g, 'niner');
}

function randomSquawkSpoken() {
  return speakDigits(String(randomSquawk()));
}

function randomSquawk() {
  let code = '';

  while (code.length < 4) {
    code += String(randomInt(0, 7));
  }

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
  out = out.replace(/\bIFR\b/g, 'IFR');
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
