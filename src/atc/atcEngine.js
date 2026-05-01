import { parseIntent } from './intentParser.js';
import { validateReadback } from './readbackValidator.js';
import { addTranscript } from './sessionStore.js';
import { digits, flightLevel, frequency, routeSpeak, squawk } from './phraseology.js';

export function handlePilotText(session, text) {
  addTranscript(session, 'PILOT', text);

  const normalizedText = normalize(text);
  const { intent } = parseIntent(text);

  if (intent === 'say_again') {
    return respond(session, session.lastAtcText || `${session.spokenCallsign}, say again.`);
  }

  /**
   * ULTRA STRICT STATE GATE:
   * If ATC is waiting for a readback, do NOT allow normal intent routing.
   * This prevents clearance readbacks from accidentally triggering radar contact,
   * departure, maintaining, descent, taxi, etc.
   */
  if (session.awaitingReadback) {
    return handleExpectedReadback(session, text, normalizedText, intent);
  }

  switch (intent) {
    case 'request_clearance':
      return clearance(session);

    case 'request_pushback':
      return pushback(session);

    case 'request_taxi':
      return taxi(session);

    case 'ready_departure':
      return takeoff(session);

    case 'airborne_checkin':
      return departure(session, normalizedText);

    case 'maintaining':
      return maintaining(session, text);

    case 'request_descent':
      return descent(session);

    case 'request_approach':
      return approach(session);

    case 'request_landing':
      return landing(session);

    default:
      return handleUnknown(session, normalizedText);
  }
}

/**
 * Readback handling must be based on what ATC is waiting for,
 * not just what the intent parser guessed.
 */
function handleExpectedReadback(session, text, normalizedText, intent) {
  const readbackType = session.readbackType || inferReadbackType(session);

  /**
   * If pilot clearly asks to repeat, repeat.
   */
  if (intent === 'say_again' || includesAny(normalizedText, ['say again', 'repeat', 'say that again'])) {
    return respond(session, session.lastAtcText || `${session.spokenCallsign}, say again.`);
  }

  /**
   * Clearance readback: validate clearance only.
   * Never allow “radar contact” here.
   */
  if (readbackType === 'clearance') {
    const check = validateReadback(session, text);

    if (check.ok || clearanceReadbackLooksGood(session, normalizedText)) {
      session.awaitingReadback = false;
      session.readbackType = null;
      session.phase = 'clearance_confirmed';

      return respond(
        session,
        `${session.spokenCallsign}, readback correct. Contact ground when ready for taxi.`,
        { check, readbackType: 'clearance' }
      );
    }

    const missing = check?.missing?.length ? check.missing.join(', ') : missingClearanceItems(session, normalizedText).join(', ');

    return respond(
      session,
      `${session.spokenCallsign}, readback incorrect, missing ${missing}. Say again clearance.`,
      { check, readbackType: 'clearance' }
    );
  }

  /**
   * Pushback readback.
   */
  if (readbackType === 'pushback') {
    const check = validateReadback(session, text);

    if (check.ok || includesAny(normalizedText, ['pushback approved', 'push back approved', 'expect runway', session.assigned.runway])) {
      session.awaitingReadback = false;
      session.readbackType = null;
      session.phase = 'pushback_confirmed';

      return respond(
        session,
        `${session.spokenCallsign}, readback correct. Advise ready to taxi.`,
        { check, readbackType: 'pushback' }
      );
    }

    return respond(
      session,
      `${session.spokenCallsign}, readback incorrect. Pushback approved, expect runway ${session.assigned.runway}.`,
      { check, readbackType: 'pushback' }
    );
  }

  /**
   * Taxi readback.
   */
  if (readbackType === 'taxi') {
    const check = validateReadback(session, text);

    if (check.ok || includesAny(normalizedText, ['taxi', 'hold short', session.assigned.runway])) {
      session.awaitingReadback = false;
      session.readbackType = null;
      session.phase = 'taxi_confirmed';

      return respond(
        session,
        `${session.spokenCallsign}, readback correct. Monitor tower approaching runway ${session.assigned.runway}.`,
        { check, readbackType: 'taxi' }
      );
    }

    return respond(
      session,
      `${session.spokenCallsign}, readback incorrect. Taxi to runway ${session.assigned.runway} via Alpha, hold short runway ${session.assigned.runway}.`,
      { check, readbackType: 'taxi' }
    );
  }

  /**
   * Takeoff readback.
   */
  if (readbackType === 'takeoff') {
    const check = validateReadback(session, text);

    if (check.ok || includesAny(normalizedText, ['cleared for takeoff', 'takeoff', session.assigned.runway])) {
      session.awaitingReadback = false;
      session.readbackType = null;
      session.phase = 'takeoff_confirmed';

      return respond(
        session,
        `${session.spokenCallsign}, readback correct.`,
        { check, readbackType: 'takeoff' }
      );
    }

    return respond(
      session,
      `${session.spokenCallsign}, readback incorrect. Runway ${session.assigned.runway}, cleared for takeoff.`,
      { check, readbackType: 'takeoff' }
    );
  }

  /**
   * Departure climb readback.
   */
  if (readbackType === 'departure') {
    const check = validateReadback(session, text);

    if (check.ok || includesAny(normalizedText, [session.cruise.replace('FL', ''), session.cruise.toLowerCase(), 'flight level'])) {
      session.awaitingReadback = false;
      session.readbackType = null;
      session.phase = 'departure';

      return respond(
        session,
        `${session.spokenCallsign}, readback correct.`,
        { check, readbackType: 'departure' }
      );
    }

    return respond(
      session,
      `${session.spokenCallsign}, readback incorrect. Climb and maintain ${flightLevel(session.cruise)}.`,
      { check, readbackType: 'departure' }
    );
  }

  /**
   * Descent readback.
   */
  if (readbackType === 'descent') {
    const check = validateReadback(session, text);

    if (check.ok || includesAny(normalizedText, ['150', 'one five zero', 'flight level one five zero', 'runway zero seven', 'runway 07'])) {
      session.awaitingReadback = false;
      session.readbackType = null;
      session.phase = 'descent_confirmed';

      return respond(
        session,
        `${session.spokenCallsign}, readback correct.`,
        { check, readbackType: 'descent' }
      );
    }

    return respond(
      session,
      `${session.spokenCallsign}, readback incorrect. Descend and maintain flight level one five zero, expect approach runway zero seven.`,
      { check, readbackType: 'descent' }
    );
  }

  /**
   * Approach readback.
   */
  if (readbackType === 'approach') {
    const check = validateReadback(session, text);

    if (check.ok || includesAny(normalizedText, ['cleared', 'approach', session.assigned.runway, session.assigned.towerFrequency])) {
      session.awaitingReadback = false;
      session.readbackType = null;
      session.phase = 'approach_confirmed';

      return respond(
        session,
        `${session.spokenCallsign}, readback correct.`,
        { check, readbackType: 'approach' }
      );
    }

    return respond(
      session,
      `${session.spokenCallsign}, readback incorrect. Cleared ILS runway ${session.assigned.runway} approach, contact tower ${frequency(session.assigned.towerFrequency)}.`,
      { check, readbackType: 'approach' }
    );
  }

  /**
   * Landing readback.
   */
  if (readbackType === 'landing') {
    const check = validateReadback(session, text);

    if (check.ok || includesAny(normalizedText, ['cleared to land', 'land', session.assigned.runway])) {
      session.awaitingReadback = false;
      session.readbackType = null;
      session.phase = 'landing_confirmed';

      return respond(
        session,
        `${session.spokenCallsign}, readback correct.`,
        { check, readbackType: 'landing' }
      );
    }

    return respond(
      session,
      `${session.spokenCallsign}, readback incorrect. Runway ${session.assigned.runway}, cleared to land.`,
      { check, readbackType: 'landing' }
    );
  }

  /**
   * Fallback for any unknown pending readback.
   */
  const check = validateReadback(session, text);

  if (check.ok) {
    session.awaitingReadback = false;
    session.readbackType = null;

    return respond(session, `${session.spokenCallsign}, readback correct.`, {
      check,
      readbackType: 'generic'
    });
  }

  return respond(
    session,
    `${session.spokenCallsign}, readback incorrect, say again.`,
    { check, readbackType: 'generic' }
  );
}

function setInstruction(session, text, required, readbackType = 'generic') {
  session.lastInstruction = { text, required };
  session.lastAtcText = text;
  session.awaitingReadback = required.length > 0;
  session.readbackType = required.length > 0 ? readbackType : null;
  return text;
}

function respond(session, text, meta = {}) {
  session.lastAtcText = text;
  addTranscript(session, 'ATC', text, meta);
  return { speaker: 'ATC', text, meta, session };
}

function clearance(session) {
  session.phase = 'clearance';

  const a = session.assigned;

  const text =
    `${session.spokenCallsign}, cleared to destination via ${routeSpeak(session.route)}, ` +
    `climb initially ${flightLevel(a.initialAltitude)}, departure frequency ${frequency(a.departureFrequency)}, ` +
    `${squawk(a.squawk)}.`;

  setInstruction(
    session,
    text,
    [
      { name: 'cleared route', match: ['cleared', 'direct', 'g633', 'anu', 'skb'] },
      { name: 'altitude', match: [a.initialAltitude.toLowerCase(), a.initialAltitude.replace('FL', ''), 'flight level'] },
      { name: 'frequency', match: [a.departureFrequency, a.departureFrequency.replace('.', ' decimal '), '119', 'one one niner'] },
      { name: 'squawk', match: [a.squawk, digits(a.squawk)] }
    ],
    'clearance'
  );

  return respond(session, text);
}

function pushback(session) {
  if (!clearanceIsComplete(session)) {
    return respond(
      session,
      `${session.spokenCallsign}, clearance not confirmed. Request IFR clearance first or read back your clearance.`
    );
  }

  session.phase = 'pushback';

  const text = `${session.spokenCallsign}, pushback approved, expect runway ${session.assigned.runway}.`;

  setInstruction(
    session,
    text,
    [
      { name: 'runway', match: [session.assigned.runway] },
      { name: 'pushback', match: ['pushback', 'push back'] }
    ],
    'pushback'
  );

  return respond(session, text);
}

function taxi(session) {
  if (!clearanceIsComplete(session)) {
    return respond(
      session,
      `${session.spokenCallsign}, clearance not confirmed. Read back your clearance before taxi.`
    );
  }

  session.phase = 'taxi';

  const text =
    `${session.spokenCallsign}, taxi to runway ${session.assigned.runway} via Alpha, ` +
    `hold short runway ${session.assigned.runway}.`;

  setInstruction(
    session,
    text,
    [
      { name: 'runway', match: [session.assigned.runway] },
      { name: 'hold short', match: ['hold short'] }
    ],
    'taxi'
  );

  return respond(session, text);
}

function takeoff(session) {
  if (!['taxi_confirmed', 'holding_short', 'tower', 'ready_departure'].includes(session.phase)) {
    return respond(
      session,
      `${session.spokenCallsign}, hold position. Taxi clearance must be completed before departure.`
    );
  }

  session.phase = 'takeoff';

  const text =
    `${session.spokenCallsign}, wind zero eight zero at eight, runway ${session.assigned.runway}, cleared for takeoff.`;

  setInstruction(
    session,
    text,
    [
      { name: 'runway', match: [session.assigned.runway] },
      { name: 'takeoff clearance', match: ['cleared for takeoff', 'takeoff'] }
    ],
    'takeoff'
  );

  return respond(session, text);
}

function departure(session, normalizedText) {
  /**
   * ULTRA STRICT:
   * Never say radar contact unless the flight is actually in/after takeoff
   * or the pilot clearly checks in airborne.
   */
  const airborneWords = [
    'airborne',
    'passing',
    'through',
    'climbing',
    'with you',
    'departure',
    'off runway',
    'out of'
  ];

  const allowedPhase = [
    'takeoff_confirmed',
    'airborne',
    'departure',
    'enroute'
  ].includes(session.phase);

  const soundsAirborne = includesAny(normalizedText, airborneWords);

  if (!allowedPhase && !soundsAirborne) {
    return respond(
      session,
      `${session.spokenCallsign}, departure check-in not received. Continue with clearance, taxi, and takeoff sequence.`
    );
  }

  session.phase = 'departure';

  const text =
    `${session.spokenCallsign}, radar contact, climb and maintain ${flightLevel(session.cruise)}, proceed on course.`;

  setInstruction(
    session,
    text,
    [
      { name: 'cruise level', match: [session.cruise.replace('FL', ''), session.cruise.toLowerCase(), 'flight level'] }
    ],
    'departure'
  );

  return respond(session, text);
}

function maintaining(session, text) {
  /**
   * Do not convert a preflight clearance readback into enroute.
   */
  if (['preflight', 'clearance', 'clearance_confirmed', 'pushback', 'taxi'].includes(session.phase)) {
    return respond(
      session,
      `${session.spokenCallsign}, roger. Continue ground sequence. Advise ready for taxi or departure as appropriate.`
    );
  }

  if (['takeoff_confirmed', 'airborne', 'departure'].includes(session.phase)) {
    session.phase = 'departure';
    return respond(session, `${session.spokenCallsign}, roger, maintain present level. Proceed on course.`);
  }

  session.phase = session.phase || 'enroute';

  return respond(session, `${session.spokenCallsign}, roger, maintain present level. Report ready for descent.`);
}

function descent(session) {
  if (!['departure', 'enroute', 'cruise'].includes(session.phase)) {
    return respond(
      session,
      `${session.spokenCallsign}, descent not available yet. Continue current clearance.`
    );
  }

  session.phase = 'descent';

  const text =
    `${session.spokenCallsign}, descend and maintain flight level one five zero, expect approach runway zero seven.`;

  setInstruction(
    session,
    text,
    [
      { name: 'descent altitude', match: ['150', 'one five zero', 'flight level one five zero'] },
      { name: 'runway', match: ['07', 'zero seven'] }
    ],
    'descent'
  );

  return respond(session, text);
}

function approach(session) {
  if (!['descent_confirmed', 'descent', 'approach'].includes(session.phase)) {
    return respond(
      session,
      `${session.spokenCallsign}, approach clearance not available yet. Continue descent or report established.`
    );
  }

  session.phase = 'approach';

  const text =
    `${session.spokenCallsign}, cleared ILS runway ${session.assigned.runway} approach, contact tower ${frequency(session.assigned.towerFrequency)}.`;

  setInstruction(
    session,
    text,
    [
      { name: 'approach clearance', match: ['cleared', 'approach'] },
      { name: 'tower frequency', match: [session.assigned.towerFrequency, session.assigned.towerFrequency.replace('.', ' decimal ')] }
    ],
    'approach'
  );

  return respond(session, text);
}

function landing(session) {
  if (!['approach_confirmed', 'approach', 'tower'].includes(session.phase)) {
    return respond(
      session,
      `${session.spokenCallsign}, landing clearance not available yet. Continue approach and report final.`
    );
  }

  session.phase = 'landing';

  const text = `${session.spokenCallsign}, runway ${session.assigned.runway}, cleared to land.`;

  setInstruction(
    session,
    text,
    [
      { name: 'landing clearance', match: ['cleared to land', 'land'] },
      { name: 'runway', match: [session.assigned.runway] }
    ],
    'landing'
  );

  return respond(session, text);
}

function handleUnknown(session, normalizedText) {
  /**
   * If the pilot repeats route/frequency/squawk/altitude while recently in clearance,
   * treat it as a clearance readback attempt, even if parser failed.
   */
  if (['clearance', 'clearance_issued'].includes(session.phase) || looksLikeClearanceReadback(session, normalizedText)) {
    session.awaitingReadback = true;
    session.readbackType = 'clearance';
    return handleExpectedReadback(session, normalizedText, normalizedText, 'readback');
  }

  if (includesAny(normalizedText, ['taxi', 'ready to taxi'])) {
    return taxi(session);
  }

  if (includesAny(normalizedText, ['ready for departure', 'holding short', 'ready departure'])) {
    return takeoff(session);
  }

  if (includesAny(normalizedText, ['with you', 'departure', 'passing', 'climbing'])) {
    return departure(session, normalizedText);
  }

  return respond(session, `${session.spokenCallsign}, say again request.`);
}

function clearanceIsComplete(session) {
  return ['clearance_confirmed', 'pushback', 'pushback_confirmed', 'taxi', 'taxi_confirmed', 'takeoff', 'takeoff_confirmed', 'departure', 'enroute'].includes(session.phase);
}

function inferReadbackType(session) {
  if (session.phase === 'clearance') return 'clearance';
  if (session.phase === 'pushback') return 'pushback';
  if (session.phase === 'taxi') return 'taxi';
  if (session.phase === 'takeoff') return 'takeoff';
  if (session.phase === 'departure') return 'departure';
  if (session.phase === 'descent') return 'descent';
  if (session.phase === 'approach') return 'approach';
  if (session.phase === 'landing') return 'landing';
  return 'generic';
}

function clearanceReadbackLooksGood(session, normalizedText) {
  const missing = missingClearanceItems(session, normalizedText);

  /**
   * Be realistic but not too strict because Vosk may mishear:
   * require at least route/destination style content plus altitude or squawk/frequency.
   */
  return missing.length <= 1 || looksLikeClearanceReadback(session, normalizedText);
}

function missingClearanceItems(session, normalizedText) {
  const a = session.assigned;
  const missing = [];

  if (!includesAny(normalizedText, ['cleared', 'clearance', 'destination', 'to '])) {
    missing.push('clearance');
  }

  if (!includesAny(normalizedText, routeTokens(session.route))) {
    missing.push('route');
  }

  if (!includesAny(normalizedText, [
    a.initialAltitude.toLowerCase(),
    a.initialAltitude.replace('FL', '').toLowerCase(),
    'flight level',
    'level'
  ])) {
    missing.push('altitude');
  }

  if (!includesAny(normalizedText, [
    a.departureFrequency,
    a.departureFrequency.replace('.', ' decimal '),
    'departure frequency',
    'one one niner',
    '119'
  ])) {
    missing.push('departure frequency');
  }

  if (!includesAny(normalizedText, [
    a.squawk,
    digits(a.squawk),
    'squawk'
  ])) {
    missing.push('squawk');
  }

  return missing;
}

function looksLikeClearanceReadback(session, normalizedText) {
  const a = session.assigned;

  const scoreItems = [
    includesAny(normalizedText, routeTokens(session.route)),
    includesAny(normalizedText, [a.initialAltitude.toLowerCase(), a.initialAltitude.replace('FL', '').toLowerCase(), 'flight level']),
    includesAny(normalizedText, [a.departureFrequency, a.departureFrequency.replace('.', ' decimal '), '119', 'one one niner']),
    includesAny(normalizedText, [a.squawk, digits(a.squawk), 'squawk']),
    includesAny(normalizedText, ['cleared', 'clearance', 'direct', 'via'])
  ];

  return scoreItems.filter(Boolean).length >= 2;
}

function routeTokens(route) {
  const raw = String(route || '').toLowerCase();

  const tokens = raw
    .split(/\s+/)
    .filter(Boolean)
    .filter(t => t.length >= 2);

  /**
   * Add common spoken fixes for your Caribbean route tests.
   */
  return Array.from(new Set([
    ...tokens,
    'skb',
    'sierra kilo bravo',
    'g633',
    'g six three three',
    'anu',
    'alpha november uniform',
    'direct'
  ]));
}

function includesAny(text, needles) {
  const haystack = normalize(text);

  return needles
    .filter(Boolean)
    .some(n => haystack.includes(normalize(n)));
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
