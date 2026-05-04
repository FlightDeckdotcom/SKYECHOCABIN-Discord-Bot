const sessions = new Map();

function getSession(guildId = 'default') {
  if (!sessions.has(guildId)) {
    sessions.set(guildId, {
      callsign: process.env.DEFAULT_CALLSIGN || 'SkyEcho Seven Three Eight',
      phase: process.env.DEFAULT_PHASE || 'departure',
      expectedPilotAction: 'open_request',
      lastInstruction: '',
      lastTranscript: '',
      lastIntent: null,
      createdAt: new Date().toISOString()
    });
  }
  return sessions.get(guildId);
}

function resetSession(guildId = 'default') {
  sessions.delete(guildId);
  return getSession(guildId);
}

function updateSession(guildId, patch = {}) {
  const session = getSession(guildId);
  Object.assign(session, patch, { updatedAt: new Date().toISOString() });
  return session;
}

module.exports = { getSession, resetSession, updateSession };
