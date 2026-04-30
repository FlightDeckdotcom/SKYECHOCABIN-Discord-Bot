import { addTranscript } from '../atc/sessionStore.js';
import { flightLevel } from '../atc/phraseology.js';

const airlines = [
  ['BAW', 'Speedbird'], ['AAL', 'American'], ['JBU', 'JetBlue'], ['DAL', 'Delta'], ['UAL', 'United'],
  ['WJA', 'WestJet'], ['AFR', 'Air France'], ['BAW', 'Speedbird'], ['KLM', 'KLM'], ['BWA', 'Caribbean']
];
const phases = ['ground', 'tower', 'departure', 'center', 'approach'];

export function seedTraffic(session, density = 'medium') {
  const count = density === 'high' ? 12 : density === 'low' ? 4 : 8;
  session.traffic = Array.from({ length: count }, (_, i) => makeAircraft(i, session));
  return session.traffic;
}

export function nextTrafficTransmission(session) {
  if (!session.traffic?.length) seedTraffic(session);
  const relevant = session.traffic.filter(t => trafficMatchesPhase(t, session.phase));
  const traffic = (relevant.length ? relevant : session.traffic)[Math.floor(Math.random() * (relevant.length ? relevant.length : session.traffic.length))];
  const line = buildTrafficLine(traffic, session.phase);
  addTranscript(session, `TRAFFIC ${traffic.callsign}`, line, { traffic });
  return { speaker: 'TRAFFIC', callsign: traffic.callsign, text: line, traffic };
}

function makeAircraft(i, session) {
  const [icao, spoken] = airlines[Math.floor(Math.random() * airlines.length)];
  const num = 100 + Math.floor(Math.random() * 8800);
  const phase = phases[i % phases.length];
  return {
    id: `${icao}${num}`,
    callsign: `${spoken} ${num}`,
    phase,
    altitude: ['FL080', 'FL120', 'FL220', 'FL300', 'FL350'][Math.floor(Math.random() * 5)],
    relation: Math.random() > 0.5 ? 'same route' : 'opposite direction',
    distanceNm: 10 + Math.floor(Math.random() * 80)
  };
}

function trafficMatchesPhase(t, phase) {
  if (phase === 'preflight' || phase === 'clearance' || phase === 'pushback' || phase === 'taxi') return t.phase === 'ground';
  if (phase === 'takeoff') return t.phase === 'tower';
  if (phase === 'departure') return t.phase === 'departure';
  if (phase === 'descent' || phase === 'approach' || phase === 'landing') return t.phase === 'approach';
  return t.phase === 'center';
}

function buildTrafficLine(t, userPhase) {
  switch (t.phase) {
    case 'ground': return `Ground, ${t.callsign}, request taxi with information Alpha.`;
    case 'tower': return `${t.callsign}, winds checked, rolling runway zero seven.`;
    case 'departure': return `Departure, ${t.callsign}, passing two thousand three hundred for ${flightLevel(t.altitude)}.`;
    case 'approach': return `Approach, ${t.callsign}, established localizer runway zero seven.`;
    default: return `Center, ${t.callsign}, maintaining ${flightLevel(t.altitude)}.`;
  }
}
