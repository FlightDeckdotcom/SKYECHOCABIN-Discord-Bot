// Add this import near the top of src/server.js:
import { saveDiscordSync, listPendingSyncs } from './discord/discordSyncStore.js';

// Add these routes before app.get('*', ...) in src/server.js:
app.post('/api/discord/sync', (req, res) => {
  try {
    const sync = saveDiscordSync(req.body || {});

    res.json({
      ok: true,
      message: 'SkyEcho session synced with Discord.',
      syncId: sync.syncId,
      pairingCode: sync.pairingCode,
      discordGuildId: sync.discordGuildId,
      discordChannelId: sync.discordChannelId,
      callsign: sync.callsign,
      route: sync.route,
      cruise: sync.cruise,
      expiresAt: sync.expiresAt,
      instructions: sync.discordChannelId
        ? 'Join the assigned SkyEcho Discord voice channel from Xbox.'
        : `Join Discord voice and say: SkyEcho sync code ${sync.pairingCode}.`
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err?.message || 'Discord sync failed'
    });
  }
});

app.get('/api/discord/syncs', (req, res) => {
  res.json({
    ok: true,
    pending: listPendingSyncs()
  });
});
