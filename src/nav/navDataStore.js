// src/nav/navDataStore.js
// SkyEcho CSV Nav Data Store
// Reads CSV files from /data and exposes airport, runway, frequency, and navaid lookup.

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

  airportByIdent: new Map(),
  runwaysByAirport: new Map(),
  frequenciesByAirport: new Map(),
  navaidsByIdent: new Map()
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

  store.airportByIdent.clear();
  store.runwaysByAirport.clear();
  store.frequenciesByAirport.clear();
  store.navaidsByIdent.clear();

  for (const airport of store.airports) {
    const ident = norm(airport.ident || airport.icao || airport.gps_code || airport.local_code);
    if (ident) store.airportByIdent.set(ident, airport);
  }

  for (const runway of store.runways) {
    const airportIdent = norm(
      runway.airport_ident ||
      runway.airport_ref ||
      runway.ident ||
      runway.icao
    );

    if (!airportIdent) continue;

    if (!store.runwaysByAirport.has(airportIdent)) {
      store.runwaysByAirport.set(airportIdent, []);
    }

    store.runwaysByAirport.get(airportIdent).push(runway);
  }

  for (const freq of store.frequencies) {
    const airportIdent = norm(
      freq.airport_ident ||
      freq.airport_ref ||
      freq.ident ||
      freq.icao
    );

    if (!airportIdent) continue;

    if (!store.frequenciesByAirport.has(airportIdent)) {
      store.frequenciesByAirport.set(airportIdent, []);
    }

    store.frequenciesByAirport.get(airportIdent).push(freq);
  }

  for (const nav of store.navaids) {
    const ident = norm(nav.ident || nav.name);
    if (ident) store.navaidsByIdent.set(ident, nav);
  }

  loaded = true;

  console.log('[NavData] Loaded CSV data:', {
    dataDir: DATA_DIR,
    airports: store.airports.length,
    runways: store.runways.length,
    frequencies: store.frequencies.length,
    navaids: store.navaids.length,
    countries: store.countries.length,
    regions: store.regions.length,
    comments: store.comments.length
  });

  return store;
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
      comments: store.comments.length
    },
    files: {
      airports: fileExists('airports.csv'),
      runways: fileExists('runways.csv'),
      frequencies: fileExists('airport-frequencies.csv'),
      navaids: fileExists('navaids.csv'),
      countries: fileExists('countries.csv'),
      regions: fileExists('regions.csv'),
      comments: fileExists('airport-comments.csv')
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
      navaidsNearby: []
    };
  }

  return {
    ok: true,
    icao: ident,
    airport,
    runways: getRunways(ident),
    frequencies: getFrequencies(ident),
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

  const first = runways[0];
  return normalizeRunwayRecord(first, normalizeRunway(first.le_ident || first.he_ident || ''));
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
  const ident = norm(airportIcao);
  const activeRunway = getActiveRunway(ident, runway);
  const freq = getBestFrequency(ident, 'ground');

  if (!activeRunway) {
    return {
      ok: false,
      reason: 'no_runway_data',
      instruction: `taxi to runway ${speakRunway(runway || '07')} via Alpha, hold short runway ${speakRunway(runway || '07')}`,
      frequency: freq
    };
  }

  const runwayText = speakRunway(activeRunway.ident);

  // Your current CSV set does not include taxiway geometry/routes,
  // so this uses runway/frequency data from CSV and keeps a safe fallback taxiway.
  const taxiRoute = inferSimpleTaxiRoute({
    airportIcao: ident,
    runway: activeRunway.ident,
    parking
  });

  return {
    ok: true,
    source: 'csv_runway_frequency_with_safe_taxi_fallback',
    airportIcao: ident,
    runway: activeRunway,
    frequency: freq,
    taxiRoute,
    instruction: `taxi to runway ${runwayText} via ${taxiRoute}, hold short runway ${runwayText}`
  };
}

function inferSimpleTaxiRoute({ airportIcao, runway }) {
  const icao = norm(airportIcao);
  const rwy = normalizeRunway(runway);

  // Until a real taxi_routes.csv exists, keep airport-specific safe defaults here.
  if (icao === 'TKPK') {
    if (rwy === '07') return 'Alpha';
    if (rwy === '25') return 'Alpha';
  }

  if (icao === 'TJSJ') {
    if (rwy === '10') return 'Alpha';
    if (rwy === '08') return 'Alpha';
  }

  return 'Alpha';
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
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);

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
