import { parseIntent } from './intentParser.js';
import { validateReadback } from './readbackValidator.js';
import { addTranscript } from './sessionStore.js';
import { digits, flightLevel, frequency, routeSpeak, squawk } from './phraseology.js';

export function handlePilotText(session, text) {
  addTranscript(session, 'PILOT', text);
  const { intent } = parseIntent(text);

  if (intent === 'say_again') return respond(session, session.lastAtcText || `${session.spokenCallsign}, say again.`);

  if (session.awaitingReadback && intent === 'readback') {
    const check = validateReadback(session, text);
    if (check.ok) {
      session.awaitingReadback = false;
      return respond(session, `${session.spokenCallsign}, readback correct.`, { check });
    }
    return respond(session, `${session.spokenCallsign}, readback incorrect, missing ${check.missing.join(', ')}. Say again.`, { check });
  }

  switch (intent) {
    case 'request_clearance': return clearance(session);
    case 'request_pushback': return pushback(session);
    case 'request_taxi': return taxi(session);
    case 'ready_departure': return takeoff(session);
    case 'airborne_checkin': return departure(session);
    case 'maintaining': return maintaining(session, text);
    case 'request_descent': return descent(session);
    case 'request_approach': return approach(session);
    case 'request_landing': return landing(session);
    default: return respond(session, `${session.spokenCallsign}, say again request.`);
  }
}

function setInstruction(session, text, required) {
  session.lastInstruction = { text, required };
  session.lastAtcText = text;
  session.awaitingReadback = required.length > 0;
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
  const text = `${session.spokenCallsign}, cleared to destination via ${routeSpeak(session.route)}, climb initially ${flightLevel(a.initialAltitude)}, departure frequency ${frequency(a.departureFrequency)}, ${squawk(a.squawk)}.`;
  setInstruction(session, text, [
    { name: 'cleared route', match: ['cleared', 'direct', 'g633', 'anu'] },
    { name: 'altitude', match: [a.initialAltitude.toLowerCase(), a.initialAltitude.replace('FL',''), 'flight level'] },
    { name: 'frequency', match: [a.departureFrequency, a.departureFrequency.replace('.', ' decimal ')] },
    { name: 'squawk', match: [a.squawk, digits(a.squawk)] }
  ]);
  return respond(session, text);
}

function pushback(session) {
  session.phase = 'pushback';
  const text = `${session.spokenCallsign}, pushback approved, expect runway ${session.assigned.runway}.`;
  setInstruction(session, text, [{ name: 'runway', match: [session.assigned.runway] }, { name: 'pushback', match: ['pushback', 'push back'] }]);
  return respond(session, text);
}

function taxi(session) {
  session.phase = 'taxi';
  const text = `${session.spokenCallsign}, taxi to runway ${session.assigned.runway} via Alpha, hold short runway ${session.assigned.runway}.`;
  setInstruction(session, text, [{ name: 'runway', match: [session.assigned.runway] }, { name: 'hold short', match: ['hold short'] }]);
  return respond(session, text);
}

function takeoff(session) {
  session.phase = 'takeoff';
  const text = `${session.spokenCallsign}, wind zero eight zero at eight, runway ${session.assigned.runway}, cleared for takeoff.`;
  setInstruction(session, text, [{ name: 'runway', match: [session.assigned.runway] }, { name: 'takeoff clearance', match: ['cleared for takeoff', 'takeoff'] }]);
  return respond(session, text);
}

function departure(session) {
  session.phase = 'departure';
  const text = `${session.spokenCallsign}, radar contact, climb and maintain ${flightLevel(session.cruise)}, proceed on course.`;
  setInstruction(session, text, [{ name: 'cruise level', match: [session.cruise.replace('FL',''), session.cruise.toLowerCase(), 'flight level'] }]);
  return respond(session, text);
}

function maintaining(session, text) {
  session.phase = session.phase === 'preflight' ? 'enroute' : session.phase;
  return respond(session, `${session.spokenCallsign}, roger, maintain present level. Report ready for descent.`);
}

function descent(session) {
  session.phase = 'descent';
  const text = `${session.spokenCallsign}, descend and maintain flight level one five zero, expect approach runway zero seven.`;
  setInstruction(session, text, [{ name: 'descent altitude', match: ['150', 'one five zero', 'flight level one five zero'] }, { name: 'runway', match: ['07', 'zero seven'] }]);
  return respond(session, text);
}

function approach(session) {
  session.phase = 'approach';
  const text = `${session.spokenCallsign}, cleared ILS runway ${session.assigned.runway} approach, contact tower ${frequency(session.assigned.towerFrequency)}.`;
  setInstruction(session, text, [{ name: 'approach clearance', match: ['cleared', 'approach'] }, { name: 'tower frequency', match: [session.assigned.towerFrequency, session.assigned.towerFrequency.replace('.', ' decimal ')] }]);
  return respond(session, text);
}

function landing(session) {
  session.phase = 'landing';
  const text = `${session.spokenCallsign}, runway ${session.assigned.runway}, cleared to land.`;
  setInstruction(session, text, [{ name: 'landing clearance', match: ['cleared to land', 'land'] }, { name: 'runway', match: [session.assigned.runway] }]);
  return respond(session, text);
}
