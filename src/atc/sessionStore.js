const sessions = new Map();

export function createSession({ guildId = 'local', channelId = 'local', callsign = 'LIAT319', route = 'TKPK SKB G633 ANU DCT TAPA', cruise = 'FL310', region = 'TTZP' } = {}) {
  const id = Math.random().toString(36).slice(2, 12);
  const session = {
    id,
    guildId,
    channelId,
    callsign: normalizeCallsign(callsign),
    spokenCallsign: speakCallsign(callsign),
    route,
    cruise,
    region,
    phase: 'preflight',
    awaitingReadback: false,
    lastInstruction: null,
    lastAtcText: null,
    assigned: {
      squawk: String(1000 + Math.floor(Math.random() * 7000)).padStart(4, '0'),
      departureFrequency: '119.60',
      approachFrequency: '120.70',
      groundFrequency: '121.90',
      towerFrequency: '118.30',
      runway: '07',
      initialAltitude: cruise
    },
    traffic: [],
    transcript: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  sessions.set(id, session);
  return session;
}

export function getSession(id) { return sessions.get(id); }
export function listSessions() { return [...sessions.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)); }
export function updateSession(id, patch) {
  const s = sessions.get(id);
  if (!s) return null;
  Object.assign(s, patch, { updatedAt: new Date().toISOString() });
  return s;
}
export function deleteSession(id) { return sessions.delete(id); }

export function addTranscript(session, speaker, text, meta = {}) {
  session.transcript.push({ ts: new Date().toISOString(), speaker, text, meta });
  session.updatedAt = new Date().toISOString();
  if (session.transcript.length > 200) session.transcript.shift();
}

export function normalizeCallsign(value = '') {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

export function speakCallsign(value = '') {
  const v = normalizeCallsign(value);
  return v.replace(/LIAT/i, 'LIAT ').replace(/JBU/i, 'JetBlue ').replace(/AAL/i, 'American ').replace(/UAL/i, 'United ');
}
