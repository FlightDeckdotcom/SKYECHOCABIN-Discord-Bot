const pendingByChannel = new Map();
const pendingByCode = new Map();
const activeByDiscordUser = new Map();

function makeCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function normalizePayload(payload = {}) {
  const code = payload.pairingCode || makeCode();

  const sync = {
    ok: true,
    syncId: payload.syncId || `sync_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    pairingCode: code,

    discordGuildId: payload.discordGuildId || process.env.DISCORD_GUILD_ID || null,
    discordChannelId: payload.discordChannelId || process.env.SKYECHO_DEFAULT_VOICE_CHANNEL_ID || null,
    discordUserId: payload.discordUserId || null,

    callsign: payload.callsign || payload.flightNumber || payload.cid || 'SKY001',
    spokenCallsign: payload.spokenCallsign || speakCallsign(payload.callsign || payload.flightNumber || 'SKY001'),

    departure: payload.departure || payload.origin || payload.dep || '',
    arrival: payload.arrival || payload.destination || payload.dest || '',
    route: payload.route || payload.routeText || '',
    cruise: payload.cruise || payload.cruiseAltitude || payload.level || 'FL310',
    aircraft: payload.aircraft || payload.aircraftType || '',
    trafficDensity: payload.trafficDensity || 'medium',

    simbriefXml: payload.simbriefXml || null,
    telemetry: payload.telemetry || null,
    traffic: payload.traffic || [],
    source: payload.source || 'SkyEchoCabin Web Sync',

    createdAt: Date.now(),
    expiresAt: Date.now() + 1000 * 60 * 30
  };

  return sync;
}

export function saveDiscordSync(payload = {}) {
  cleanupExpiredSyncs();

  const sync = normalizePayload(payload);

  if (sync.discordChannelId) {
    pendingByChannel.set(sync.discordChannelId, sync);
  }

  pendingByCode.set(sync.pairingCode, sync);

  return sync;
}

export function getPendingSyncForChannel(channelId) {
  cleanupExpiredSyncs();

  if (!channelId) return null;

  return pendingByChannel.get(channelId) || null;
}

export function consumePendingSyncForChannel(channelId, discordUserId = null) {
  cleanupExpiredSyncs();

  const sync = getPendingSyncForChannel(channelId);

  if (!sync) return null;

  if (discordUserId) {
    sync.discordUserId = discordUserId;
    activeByDiscordUser.set(discordUserId, sync);
  }

  pendingByChannel.delete(channelId);
  pendingByCode.delete(sync.pairingCode);

  return sync;
}

export function consumePendingSyncByCode(code, discordUserId = null) {
  cleanupExpiredSyncs();

  const sync = pendingByCode.get(String(code || '').trim());

  if (!sync) return null;

  if (discordUserId) {
    sync.discordUserId = discordUserId;
    activeByDiscordUser.set(discordUserId, sync);
  }

  if (sync.discordChannelId) {
    pendingByChannel.delete(sync.discordChannelId);
  }

  pendingByCode.delete(sync.pairingCode);

  return sync;
}

export function getActiveSyncForDiscordUser(discordUserId) {
  cleanupExpiredSyncs();

  return activeByDiscordUser.get(discordUserId) || null;
}

export function listPendingSyncs() {
  cleanupExpiredSyncs();

  return Array.from(pendingByCode.values());
}

function cleanupExpiredSyncs() {
  const now = Date.now();

  for (const [channelId, sync] of pendingByChannel.entries()) {
    if (sync.expiresAt <= now) pendingByChannel.delete(channelId);
  }

  for (const [code, sync] of pendingByCode.entries()) {
    if (sync.expiresAt <= now) pendingByCode.delete(code);
  }

  for (const [userId, sync] of activeByDiscordUser.entries()) {
    if (sync.expiresAt <= now) activeByDiscordUser.delete(userId);
  }
}

function speakCallsign(callsign) {
  const raw = String(callsign || 'SKY001').toUpperCase().replace(/\s+/g, '');

  return raw
    .replace(/^LIAT/, 'LIAT ')
    .replace(/^SKY/, 'SkyEcho ')
    .replace(/(\D)(\d)/, '$1 $2')
    .trim();
}
