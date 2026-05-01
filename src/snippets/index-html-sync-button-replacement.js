// In index.html, find: byId('skyechoSyncBtn').onclick=function(){
// Replace that whole function with this:
byId('skyechoSyncBtn').onclick = async function () {
  try {
    var discordBackend = 'https://skyechocabin-discord-bot-3.onrender.com';

    var sessionId = sid();

    var payload = {
      sessionId: sessionId,
      source: 'SkyEchoCabin Web App',
      at: Date.now(),

      telemetry: window.__skyechoTelemetryState || null,
      traffic: window.__skyechoTrafficState || [],
      xmlTrafficSeeds: window.__skyechoXmlTrafficSeeds || [],
      simbriefXml: window.__skyechoSimbriefXml || null,

      callsign:
        (window.__skyechoFlightPlan && (window.__skyechoFlightPlan.callsign || window.__skyechoFlightPlan.flightNumber)) ||
        (__skyechoLS.getItem('skyecho_callsign')) ||
        'LIAT319',

      departure:
        (window.__skyechoFlightPlan && (window.__skyechoFlightPlan.departure || window.__skyechoFlightPlan.origin)) ||
        (__skyechoLS.getItem('skyecho_departure')) ||
        'TKPK',

      arrival:
        (window.__skyechoFlightPlan && (window.__skyechoFlightPlan.arrival || window.__skyechoFlightPlan.destination)) ||
        (__skyechoLS.getItem('skyecho_arrival')) ||
        'TAPA',

      route:
        (window.__skyechoFlightPlan && window.__skyechoFlightPlan.route) ||
        (__skyechoLS.getItem('skyecho_route')) ||
        'TKPK SKB G633 ANU DCT TAPA',

      cruise:
        (window.__skyechoFlightPlan && (window.__skyechoFlightPlan.cruise || window.__skyechoFlightPlan.cruiseAltitude)) ||
        (__skyechoLS.getItem('skyecho_cruise')) ||
        'FL310',

      aircraft:
        (window.__skyechoFlightPlan && (window.__skyechoFlightPlan.aircraft || window.__skyechoFlightPlan.aircraftType)) ||
        (__skyechoLS.getItem('skyecho_aircraft')) ||
        'B738',

      trafficDensity:
        (__skyechoLS.getItem('skyecho_traffic_density')) ||
        'medium',

      discordGuildId: '1498152208372465685',
      discordChannelId: __skyechoLS.getItem('skyecho_discord_channel_id') || ''
    };

    var response = await fetch(discordBackend + '/api/discord/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    var data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || ('HTTP ' + response.status));
    }

    __skyechoLS.setItem('skyecho_discord_last_sync', JSON.stringify(data));

    log({
      ok: true,
      status: 'discord_synced',
      message: data.message,
      callsign: data.callsign,
      route: data.route,
      cruise: data.cruise,
      pairingCode: data.pairingCode,
      instructions: data.instructions
    });

    alert(
      'SkyEcho synced with Discord.\n\n' +
      'Callsign: ' + data.callsign + '\n' +
      'Pairing Code: ' + data.pairingCode + '\n\n' +
      data.instructions
    );
  } catch (e) {
    log({
      ok: false,
      status: 'discord_sync_failed',
      error: e.message || String(e)
    });

    alert('Discord sync failed: ' + (e.message || String(e)));
  }
};
