// src/nav/navDataStore.js
// SkyEcho CSV Nav Data Store
// Reads CSV files from /data and exposes airport, runway, frequency, navaid,
// taxiway, apron, stopway, ATS route, designated point, ILS, and procedure helper lookup.

import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');

let loaded = false;

const store = {
  airports: [],
  runways: [],
  frequencies: [],
  navaids: [],
  countries: [],
  regions: [],
  comments: [],

  pendingTaxiways: [],
  pendingAprons: [],
  pendingStopways: [],
  pendingAtsRoutes: [],
  pendingDesignatedPoints: [],
  pendingIlsSystems: [],
  pendingIlsComponents: [],
  pendingNavaidSystems: [],
  pendingNavaidComponents: [],
  routePortions: [],
  airportRunwayTaxiway: [],

  airportByIdent: new Map(),
  runwaysByAirport: new Map(),
  frequenciesByAirport: new Map(),
  navaidsByIdent: new Map(),

  taxiwaysByAirport: new Map(),
  apronsByAirport: new Map(),
  stopwaysByAirport: new Map(),
  atsRoutesByAirport: new Map(),
  designatedPointsByIdent: new Map(),
  ilsByAirport: new Map(),
  routePortionsByRoute: new Map(),
  airportRunwayTaxiwayByAirport: new Map()
};

export function loadNavData() {
  if (loaded) return store;

  store.airports = readCsv('airports.csv');
  store.runways = readCsv('runways.csv');
  store.frequencies = readCsv('airport-frequencies.csv');
  store.navaids = readCsv('navaids.csv');
  store.countries = readCsv('countries.csv');
  store.regions = readCsv('regions.csv');
  store.comments = readCsv('airport-comments.csv');

  store.pendingTaxiways = readCsv('Pending_AM_Taxiway.csv');
  store.pendingAprons = readCsv('Pending_AM_Apron.csv');
  store.pendingStopways = readCsv('Pending_AM_Stopway.csv');
  store.pendingAtsRoutes = readCsv('Pending_ATS_Route.csv');
  store.pendingDesignatedPoints = readCsv('Pending_Designated_Point.csv');
  store.pendingIlsSystems = readCsv('Pending_ILS_System.csv');
  store.pendingIlsComponents = readCsv('Pending_ILS_Component.csv');
  store.pendingNavaidSystems = readCsv('Pending_NAVAID_System.csv');
  store.pendingNavaidComponents = readCsv('Pending_NAVAID_Component.csv');
  store.routePortions = readCsv('RoutePortionPending.csv');
  store.airportRunwayTaxiway = readCsv('Airport_Runway_and_Taxiway.csv');

  clearIndexes();
  buildAirportIndex();
  buildRunwayIndex();
  buildFrequencyIndex();
  buildNavaidIndex();
  buildTaxiwayIndex();
  buildApronIndex();
  buildStopwayIndex();
  buildAtsRouteIndex();
  buildDesignatedPointIndex();
  buildIlsIndex();
  buildRoutePortionIndex();
  buildAirportRunwayTaxiwayIndex();

  loaded = true;

  console.log('[NavData] Loaded CSV data:', {
    dataDir: DATA_DIR,

    airports: store.airports.length,
    runways: store.runways.length,
    frequencies: store.frequencies.length,
    navaids: store.navaids.length,
    countries: store.countries.length,
    regions: store.regions.length,
    comments: store.comments.length,

    pendingTaxiways: store.pendingTaxiways.length,
    pendingAprons: store.pendingAprons.length,
    pendingStopways: store.pendingStopways.length,
    pendingAtsRoutes: store.pendingAtsRoutes.length,
    pendingDesignatedPoints: store.pendingDesignatedPoints.length,
    pendingIlsSystems: store.pendingIlsSystems.length,
    pendingIlsComponents: store.pendingIlsComponents.length,
    pendingNavaidSystems: store.pendingNavaidSystems.length,
    pendingNavaidComponents: store.pendingNavaidComponents.length,
    routePortions: store.routePortions.length,
    airportRunwayTaxiway: store.airportRunwayTaxiway.length
  });

  return store;
}

function clearIndexes() {
  store.airportByIdent.clear();
  store.runwaysByAirport.clear();
  store.frequenciesByAirport.clear();
  store.navaidsByIdent.clear();

  store.taxiwaysByAirport.clear();
  store.apronsByAirport.clear();
  store.stopwaysByAirport.clear();
  store.atsRoutesByAirport.clear();
  store.designatedPointsByIdent.clear();
  store.ilsByAirport.clear();
  store.routePortionsByRoute.clear();
  store.airportRunwayTaxiwayByAirport.clear();
}

function buildAirportIndex() {
  for (const airport of store.airports) {
    const ident = norm(
      airport.ident ||
      airport.icao ||
      airport.gps_code ||
      airport.local_code
    );

    if (ident) store.airportByIdent.set(ident, airport);
  }
}

function buildRunwayIndex() {
  for (const runway of store.runways) {
    const airportIdent = norm(
      runway.airport_ident ||
      runway.airport_ref ||
      runway.ident ||
      runway.icao
    );

    if (!airportIdent) continue;

    pushMapArray(store.runwaysByAirport, airportIdent, runway);
  }
}

function buildFrequencyIndex() {
  for (const freq of store.frequencies) {
    const airportIdent = norm(
      freq.airport_ident ||
      freq.airport_ref ||
      freq.ident ||
      freq.icao
    );

    if (!airportIdent) continue;

    pushMapArray(store.frequenciesByAirport, airportIdent, freq);
  }
}

function buildNavaidIndex() {
  for (const nav of store.navaids) {
    const ident = norm(nav.ident || nav.name);
    if (ident) store.navaidsByIdent.set(ident, nav);
  }

  for (const nav of store.pendingNavaidSystems) {
    const ident = norm(
      nav.IDENT ||
      nav.NAVAID_ID ||
      nav.FAA_ID ||
      nav.DESIGNATOR ||
      nav.NAME
    );

    if (ident && !store.navaidsByIdent.has(ident)) {
      store.navaidsByIdent.set(ident, nav);
    }
  }
}

function buildTaxiwayIndex() {
  for (const twy of store.pendingTaxiways) {
    const airportIdent = getAirportIdentFromPending(twy);
    if (!airportIdent) continue;

    pushMapArray(store.taxiwaysByAirport, airportIdent, normalizeTaxiwayRecord(twy));
  }
}

function buildApronIndex() {
  for (const apron of store.pendingAprons) {
    const airportIdent = getAirportIdentFromPending(apron);
    if (!airportIdent) continue;

    pushMapArray(store.apronsByAirport, airportIdent, apron);
  }
}

function buildStopwayIndex() {
  for (const stopway of store.pendingStopways) {
    const airportIdent = getAirportIdentFromPending(stopway);
    if (!airportIdent) continue;

    pushMapArray(store.stopwaysByAirport, airportIdent, stopway);
  }
}

function buildAtsRouteIndex() {
  for (const route of store.pendingAtsRoutes) {
    const airportIdent = getAirportIdentFromPending(route);
    if (!airportIdent) continue;

    pushMapArray(store.atsRoutesByAirport, airportIdent, route);
  }
}

function buildDesignatedPointIndex() {
  for (const point of store.pendingDesignatedPoints) {
    const ident = norm(
      point.IDENT ||
      point.DESIGNATOR ||
      point.FIX_ID ||
      point.NAME ||
      point.OBJECTID
    );

    if (ident) store.designatedPointsByIdent.set(ident, point);
  }
}

function buildIlsIndex() {
  for (const ils of store.pendingIlsSystems) {
    const airportIdent = getAirportIdentFromPending(ils);
    if (!airportIdent) continue;

    pushMapArray(store.ilsByAirport, airportIdent, ils);
  }

  for (const ils of store.pendingIlsComponents) {
    const airportIdent = getAirportIdentFromPending(ils);
    if (!airportIdent) continue;

    pushMapArray(store.ilsByAirport, airportIdent, ils);
  }
}

function buildRoutePortionIndex() {
  for (const route of store.routePortions) {
    const routeId = norm(
      route.ROUTE_ID ||
      route.ATS_ROUTE_ID ||
      route.DESIGNATOR ||
      route.ROUTE ||
      route.NAME
    );

    if (!routeId) continue;

    pushMapArray(store.routePortionsByRoute, routeId, route);
  }
}

function buildAirportRunwayTaxiwayIndex() {
  for (const row of store.airportRunwayTaxiway) {
    const airportIdent = norm(
      row.ICAO_ID ||
      row.AIRPORT_IDENT ||
      row.AIRPORT_ID ||
      row.FAA_ID
    );

    if (!airportIdent) continue;

    pushMapArray(store.airportRunwayTaxiwayByAirport, airportIdent, row);
  }
}

export function getNavDataStatus() {
  loadNavData();

  return {
    ok: true,
    dataDir: DATA_DIR,
    loaded,
    counts: {
      airports: store.airports.length,
      runways: store.runways.length,
      frequencies: store.frequencies.length,
      navaids: store.navaids.length,
      countries: store.countries.length,
      regions: store.regions.length,
      comments: store.comments.length,

      pendingTaxiways: store.pendingTaxiways.length,
      pendingAprons: store.pendingAprons.length,
      pendingStopways: store.pendingStopways.length,
      pendingAtsRoutes: store.pendingAtsRoutes.length,
      pendingDesignatedPoints: store.pendingDesignatedPoints.length,
      pendingIlsSystems: store.pendingIlsSystems.length,
      pendingIlsComponents: store.pendingIlsComponents.length,
      pendingNavaidSystems: store.pendingNavaidSystems.length,
      pendingNavaidComponents: store.pendingNavaidComponents.length,
      routePortions: store.routePortions.length,
      airportRunwayTaxiway: store.airportRunwayTaxiway.length
    },
    indexed: {
      airports: store.airportByIdent.size,
      runwayAirports: store.runwaysByAirport.size,
      frequencyAirports: store.frequenciesByAirport.size,
      navaids: store.navaidsByIdent.size,
      taxiwayAirports: store.taxiwaysByAirport.size,
      apronAirports: store.apronsByAirport.size,
      stopwayAirports: store.stopwaysByAirport.size,
      atsRouteAirports: store.atsRoutesByAirport.size,
      designatedPoints: store.designatedPointsByIdent.size,
      ilsAirports: store.ilsByAirport.size,
      routePortions: store.routePortionsByRoute.size,
      airportRunwayTaxiwayAirports: store.airportRunwayTaxiwayByAirport.size
    },
    files: {
      airports: fileExists('airports.csv'),
      runways: fileExists('runways.csv'),
      frequencies: fileExists('airport-frequencies.csv'),
      navaids: fileExists('navaids.csv'),
      countries: fileExists('countries.csv'),
      regions: fileExists('regions.csv'),
      comments: fileExists('airport-comments.csv'),

      pendingTaxiways: fileExists('Pending_AM_Taxiway.csv'),
      pendingAprons: fileExists('Pending_AM_Apron.csv'),
      pendingStopways: fileExists('Pending_AM_Stopway.csv'),
      pendingAtsRoutes: fileExists('Pending_ATS_Route.csv'),
      pendingDesignatedPoints: fileExists('Pending_Designated_Point.csv'),
      pendingIlsSystems: fileExists('Pending_ILS_System.csv'),
      pendingIlsComponents: fileExists('Pending_ILS_Component.csv'),
      pendingNavaidSystems: fileExists('Pending_NAVAID_System.csv'),
      pendingNavaidComponents: fileExists('Pending_NAVAID_Component.csv'),
      routePortions: fileExists('RoutePortionPending.csv'),
      airportRunwayTaxiway: fileExists('Airport_Runway_and_Taxiway.csv')
    }
  };
}

export function getAirport(icao) {
  loadNavData();

  const ident = norm(icao);
  if (!ident) return null;

  return store.airportByIdent.get(ident) || null;
}

export function getAirportBundle(icao) {
  loadNavData();

  const ident = norm(icao);
  const airport = getAirport(ident);

  if (!airport) {
    return {
      ok: false,
      icao: ident,
      airport: null,
      runways: [],
      frequencies: [],
      taxiways: [],
      aprons: [],
      stopways: [],
      ils: [],
      navaidsNearby: []
    };
  }

  return {
    ok: true,
    icao: ident,
    airport,
    runways: getRunways(ident),
    frequencies: getFrequencies(ident),
    taxiways: getTaxiways(ident),
    aprons: getAprons(ident),
    stopways: getStopways(ident),
    ils: getIlsSystems(ident),
    navaidsNearby: getNearbyNavaidsForAirport(ident)
  };
}

export function getRunways(icao) {
  loadNavData();

  const ident = norm(icao);
  return store.runwaysByAirport.get(ident) || [];
}

export function getFrequencies(icao) {
  loadNavData();

  const ident = norm(icao);
  return store.frequenciesByAirport.get(ident) || [];
}

export function getTaxiways(icao) {
  loadNavData();

  const ident = norm(icao);
  return store.taxiwaysByAirport.get(ident) || [];
}

export function getAprons(icao) {
  loadNavData();

  const ident = norm(icao);
  return store.apronsByAirport.get(ident) || [];
}

export function getStopways(icao) {
  loadNavData();

  const ident = norm(icao);
  return store.stopwaysByAirport.get(ident) || [];
}

export function getIlsSystems(icao) {
  loadNavData();

  const ident = norm(icao);
  return store.ilsByAirport.get(ident) || [];
}

export function getBestFrequency(icao, preferredType = '') {
  const freqs = getFrequencies(icao);
  const wanted = String(preferredType || '').toLowerCase();

  if (!freqs.length) return null;

  const priority = [];

  if (wanted.includes('ground')) {
    priority.push('ground', 'gnd');
  } else if (wanted.includes('tower')) {
    priority.push('tower', 'twr');
  } else if (wanted.includes('departure')) {
    priority.push('departure', 'dep', 'approach', 'app');
  } else if (wanted.includes('approach')) {
    priority.push('approach', 'app', 'departure', 'dep');
  } else if (wanted.includes('clearance')) {
    priority.push('clearance', 'delivery', 'del', 'ground', 'gnd');
  }

  priority.push('tower', 'twr', 'ground', 'gnd', 'approach', 'app', 'departure', 'dep');

  for (const key of priority) {
    const match = freqs.find(f => {
      const type = String(f.type || f.description || '').toLowerCase();
      return type.includes(key);
    });

    if (match) return normalizeFrequencyRecord(match);
  }

  return normalizeFrequencyRecord(freqs[0]);
}

export function getActiveRunway(icao, preferredRunway = '') {
  const runways = getRunways(icao);

  if (!runways.length) return null;

  const preferred = normalizeRunway(preferredRunway);

  if (preferred) {
    const exact = runways.find(r =>
      normalizeRunway(r.le_ident) === preferred ||
      normalizeRunway(r.he_ident) === preferred
    );

    if (exact) return normalizeRunwayRecord(exact, preferred);
  }

  const first = runways.find(r => String(r.closed || '').trim() !== '1') || runways[0];

  return normalizeRunwayRecord(
    first,
    normalizeRunway(first.le_ident || first.he_ident || '')
  );
}

export function getNavaid(ident) {
  loadNavData();

  return store.navaidsByIdent.get(norm(ident)) || null;
}

export function getNearbyNavaidsForAirport(icao, maxCount = 10) {
  const airport = getAirport(icao);

  if (!airport) return [];

  const alat = Number(airport.latitude_deg);
  const alon = Number(airport.longitude_deg);

  if (!Number.isFinite(alat) || !Number.isFinite(alon)) return [];

  return store.navaids
    .map(nav => {
      const nlat = Number(nav.latitude_deg);
      const nlon = Number(nav.longitude_deg);

      if (!Number.isFinite(nlat) || !Number.isFinite(nlon)) return null;

      return {
        ...nav,
        distanceNm: haversineNm(alat, alon, nlat, nlon)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceNm - b.distanceNm)
    .slice(0, maxCount);
}

export function getTaxiInstructionFromCsv({
  airportIcao,
  runway,
  parking = ''
}) {
  loadNavData();

  const ident = norm(airportIcao);
  const activeRunway = getActiveRunway(ident, runway);
  const freq = getBestFrequency(ident, 'ground');

  const requestedRunway =
    activeRunway?.ident ||
    normalizeRunway(runway) ||
    '07';

  const airportTaxiways = getTaxiways(ident);
  const airportAprons = getAprons(ident);
  const airportStopways = getStopways(ident);

  const taxiRoute = inferTaxiRouteFromTaxiways({
    airportIcao: ident,
    runway: requestedRunway,
    parking,
    taxiways: airportTaxiways,
    aprons: airportAprons,
    stopways: airportStopways
  });

  if (!activeRunway) {
    return {
      ok: false,
      reason: 'no_runway_data',
      source: taxiRoute.source,
      airportIcao: ident,
      runway: {
        ident: requestedRunway
      },
      frequency: freq,
      taxiwaysAvailable: airportTaxiways.map(t => t.designator),
      taxiRoute: taxiRoute.route,
      instruction: `taxi to runway ${speakRunway(requestedRunway)} via ${taxiRoute.route}, hold short runway ${speakRunway(requestedRunway)}`
    };
  }

  const runwayText = speakRunway(activeRunway.ident);

  return {
    ok: true,
    source: taxiRoute.source,
    airportIcao: ident,
    runway: activeRunway,
    frequency: freq,
    taxiwaysAvailable: airportTaxiways.map(t => t.designator),
    apronCount: airportAprons.length,
    stopwayCount: airportStopways.length,
    taxiRoute: taxiRoute.route,
    instruction: `taxi to runway ${runwayText} via ${taxiRoute.route}, hold short runway ${runwayText}`
  };
}

function inferTaxiRouteFromTaxiways({
  airportIcao,
  runway,
  parking,
  taxiways = [],
  aprons = [],
  stopways = []
}) {
  const ident = norm(airportIcao);
  const rwy = normalizeRunway(runway);

  const usableTaxiways = taxiways
    .filter(t => t.designator)
    .filter(t => String(t.operational || '').trim() !== '0')
    .sort((a, b) => {
      const aLen = Number(a.length || 0);
      const bLen = Number(b.length || 0);
      return bLen - aLen;
    });

  const uniqueDesignators = unique(
    usableTaxiways
      .map(t => cleanTaxiwayDesignator(t.designator))
      .filter(Boolean)
      .filter(x => !isBadTaxiwayDesignator(x))
  );

  if (uniqueDesignators.length) {
    const selected = chooseTaxiwayDesignators({
      airportIcao: ident,
      runway: rwy,
      parking,
      designators: uniqueDesignators
    });

    return {
      source: 'Pending_AM_Taxiway.csv_designators',
      route: selected.join(' and ')
    };
  }

  const combinedRows = store.airportRunwayTaxiwayByAirport.get(ident) || [];
  const combinedDesignators = unique(
    combinedRows
      .map(row =>
        row.TAXIWAY ||
        row.TWY ||
        row.TWY_ID ||
        row.DESIGNATOR ||
        row.TAXIWAY_DESIGNATOR
      )
      .map(cleanTaxiwayDesignator)
      .filter(Boolean)
      .filter(x => !isBadTaxiwayDesignator(x))
  );

  if (combinedDesignators.length) {
    const selected = chooseTaxiwayDesignators({
      airportIcao: ident,
      runway: rwy,
      parking,
      designators: combinedDesignators
    });

    return {
      source: 'Airport_Runway_and_Taxiway.csv_designators',
      route: selected.join(' and ')
    };
  }

  if (ident === 'TKPK') {
    if (rwy === '07') return { source: 'airport_safe_fallback', route: 'Alpha' };
    if (rwy === '25') return { source: 'airport_safe_fallback', route: 'Alpha' };
  }

  if (ident === 'TJSJ') {
    if (rwy === '10') return { source: 'airport_safe_fallback', route: 'Alpha' };
    if (rwy === '08') return { source: 'airport_safe_fallback', route: 'Alpha' };
  }

  return {
    source: 'generic_safe_fallback',
    route: 'Alpha'
  };
}

function chooseTaxiwayDesignators({
  airportIcao,
  runway,
  parking,
  designators
}) {
  const names = unique(designators);

  if (!names.length) return ['Alpha'];

  const simple = names.filter(name => /^[A-Z]$/.test(name));
  const compound = names.filter(name => /^[A-Z]_[A-Z0-9]+$/.test(name));
  const numeric = names.filter(name => /^[A-Z][0-9]+$/.test(name));
  const others = names.filter(name =>
    !simple.includes(name) &&
    !compound.includes(name) &&
    !numeric.includes(name)
  );

  const ordered = [
    ...simple,
    ...numeric,
    ...compound,
    ...others
  ];

  const preferred = [];

  for (const item of ordered) {
    const base = item.split('_')[0];

    if (base && !preferred.includes(base)) {
      preferred.push(base);
    }

    if (preferred.length >= 2) break;
  }

  if (!preferred.length) return ['Alpha'];

  return preferred.map(speakTaxiway);
}

function normalizeTaxiwayRecord(row) {
  return {
    raw: row,
    objectId: row.OBJECTID || row.objectid || '',
    faaId: norm(row.FAA_ID || row.faa_id),
    icaoId: norm(row.ICAO_ID || row.icao_id),
    airportIdent: getAirportIdentFromPending(row),
    designator: cleanTaxiwayDesignator(row.DESIGNATOR || row.designator),
    surface: row.SURFACE || row.surface || '',
    operational: row.TWY_OPER || row.twy_oper || '',
    area: row.Shape__Area || row.Shape_Area || row.shape_area || '',
    length: row.Shape__Length || row.Shape_Length || row.shape_length || ''
  };
}

function normalizeRunwayRecord(runway, selectedIdent = '') {
  const ident = normalizeRunway(selectedIdent || runway.le_ident || runway.he_ident);

  return {
    raw: runway,
    ident,
    le_ident: normalizeRunway(runway.le_ident),
    he_ident: normalizeRunway(runway.he_ident),
    length_ft: runway.length_ft ? Number(runway.length_ft) : null,
    width_ft: runway.width_ft ? Number(runway.width_ft) : null,
    surface: runway.surface || '',
    lighted: runway.lighted || '',
    closed: runway.closed || ''
  };
}

function normalizeFrequencyRecord(freq) {
  return {
    raw: freq,
    type: freq.type || '',
    description: freq.description || '',
    frequency_mhz: freq.frequency_mhz || freq.frequency || '',
    spoken: speakFrequency(freq.frequency_mhz || freq.frequency || '')
  };
}

function getAirportIdentFromPending(row = {}) {
  return norm(
    row.ICAO_ID ||
    row.ICAO ||
    row.AIRPORT_ICAO ||
    row.AIRPORT_IDENT ||
    row.AIRPORT_ID ||
    row.ARPT_ID ||
    row.LOC_ID ||
    row.FAA_ID
  );
}

function cleanTaxiwayDesignator(value) {
  return String(value || '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, '')
    .replace(/-/g, '_');
}

function isBadTaxiwayDesignator(value) {
  const v = String(value || '').trim();

  if (!v) return true;
  if (v === 'N/A') return true;
  if (v === 'NA') return true;
  if (v === 'NONE') return true;
  if (v === 'NULL') return true;
  if (v === '-') return true;

  return false;
}

function speakTaxiway(designator) {
  const d = String(designator || '').toUpperCase().trim();

  const phonetic = {
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

  if (/^[A-Z]$/.test(d)) return phonetic[d] || d;

  if (/^[A-Z][0-9]+$/.test(d)) {
    const letter = phonetic[d[0]] || d[0];
    const nums = d
      .slice(1)
      .split('')
      .map(ch => DIGIT_WORDS[ch] || ch)
      .join(' ');

    return `${letter} ${nums}`;
  }

  if (/^[A-Z]_[A-Z0-9]+$/.test(d)) {
    return phonetic[d.split('_')[0]] || d.split('_')[0];
  }

  return d;
}

function readCsv(filename) {
  const filePath = path.join(DATA_DIR, filename);

  if (!fs.existsSync(filePath)) {
    console.warn(`[NavData] Missing ${filePath}`);
    return [];
  }

  const text = fs.readFileSync(filePath, 'utf8');

  return parseCsv(text);
}

function parseCsv(text) {
  const rows = [];
  const lines = String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter(line => line.trim().length > 0);

  if (!lines.length) return rows;

  const headers = parseCsvLine(lines[0]).map(h => h.trim());

  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });

    rows.push(row);
  }

  return rows;
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  values.push(current);

  return values;
}

function fileExists(filename) {
  return fs.existsSync(path.join(DATA_DIR, filename));
}

function norm(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeRunway(value) {
  const raw = String(value || '').toUpperCase().replace(/^RWY\s*/, '').trim();
  const match = raw.match(/(\d{1,2})([LRC])?/);

  if (!match) return '';

  return `${match[1].padStart(2, '0')}${match[2] || ''}`;
}

function speakRunway(runway) {
  const r = normalizeRunway(runway) || '07';
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

  return `${digits.split('').map(d => DIGIT_WORDS[d] || d).join(' ')}${suffixWord}`;
}

function speakFrequency(freq = '') {
  return String(freq || '').replace('.', ' decimal ');
}

const DIGIT_WORDS = {
  0: 'zero',
  1: 'one',
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
  6: 'six',
  7: 'seven',
  8: 'eight',
  9: 'niner'
};

function haversineNm(lat1, lon1, lat2, lon2) {
  const earthRadiusNm = 3440.065;
  const toRad = deg => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return earthRadiusNm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pushMapArray(map, key, value) {
  const k = norm(key);

  if (!k) return;

  if (!map.has(k)) {
    map.set(k, []);
  }

  map.get(k).push(value);
}

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}
