// src/atc/readbackValidator.js
// More tolerant readback validation for Discord STT and typed readbacks.
// It validates vital items, not exact wording/order.

import { normalizeForReadbackCompare } from '../utils/aviationSttNormalizer.js';

export function validateReadback(session, text) {
  const instruction = session?.lastInstruction;

  if (!instruction) {
    return { ok: false, missing: ['no active instruction'], matched: [] };
  }

  const raw = String(text || '');
  const normalized = normalizeForReadbackCompare(raw);
  const instructionText = normalizeForReadbackCompare(instruction.text || session.lastAtcText || '');

  const required = Array.isArray(instruction.required) ? instruction.required : [];
  const matched = [];
  const missing = [];

  for (const item of required) {
    const result = matchRequiredItem(item, normalized, instructionText, session);

    if (result.ok) matched.push(item.name || result.name || 'item');
    else missing.push(item.name || result.name || 'item');
  }

  return {
    ok: missing.length === 0,
    missing,
    matched,
    normalized,
    instructionText
  };
}

function matchRequiredItem(item, normalizedText, instructionText, session) {
  const name = String(item?.name || '').toLowerCase();
  const options = Array.isArray(item?.match) ? item.match : [item?.match].filter(Boolean);

  // Direct option matching first.
  for (const option of options) {
    const normalizedOption = normalizeForReadbackCompare(option);
    if (!normalizedOption) continue;

    if (normalizedText.includes(normalizedOption)) {
      return { ok: true, name };
    }

    // Accept compact number equivalents.
    const compactOption = compact(normalizedOption);
    const compactText = compact(normalizedText);

    if (compactOption && compactText.includes(compactOption)) {
      return { ok: true, name };
    }
  }

  // Semantic matching by item name.
  if (/squawk/.test(name)) {
    const expected = findSquawk(instructionText, session);
    if (!expected) return { ok: true, name };
    return { ok: normalizedText.includes(expected) || compact(normalizedText).includes(expected), name };
  }

  if (/frequency|freq|departure frequency|tower frequency/.test(name)) {
    const expected = findFrequency(instructionText, session);
    if (!expected) return { ok: true, name };
    return { ok: compact(normalizedText).includes(compact(expected)), name };
  }

  if (/altitude|level|cruise/.test(name)) {
    const expected = findAltitude(instructionText, session);
    if (!expected) return { ok: true, name };
    return { ok: altitudeMatches(normalizedText, expected), name };
  }

  if (/runway/.test(name)) {
    const expected = findRunway(instructionText, session);
    if (!expected) return { ok: true, name };
    return { ok: runwayMatches(normalizedText, expected), name };
  }

  if (/route|cleared route/.test(name)) {
    return { ok: routeMatches(normalizedText, instructionText, session), name };
  }

  if (/hold short/.test(name)) {
    return { ok: /hold short|holding short|short/.test(normalizedText), name };
  }

  if (/takeoff/.test(name)) {
    return { ok: /cleared.*takeoff|takeoff/.test(normalizedText), name };
  }

  if (/landing/.test(name)) {
    return { ok: /cleared.*land|land|landing/.test(normalizedText), name };
  }

  if (/approach/.test(name)) {
    return { ok: /cleared.*approach|approach|ils|visual/.test(normalizedText), name };
  }

  // If item had no usable matches and no known semantic rule, don't block the readback.
  if (options.length === 0) return { ok: true, name };

  return { ok: false, name };
}

function findSquawk(text, session) {
  const assigned = session?.assigned?.squawk || session?.squawk;
  if (assigned) return String(assigned).replace(/\D/g, '');

  const m = String(text).match(/\bsquawk\s+(\d{3,4})\b/);
  return m?.[1] || null;
}

function findFrequency(text, session) {
  const assigned =
    session?.assigned?.departureFrequency ||
    session?.assigned?.towerFrequency ||
    session?.frequency;

  if (assigned) return String(assigned).replace(/[^\d.]/g, '');

  const m = String(text).match(/\b(\d{3}\.?\d{1,3})\b/);
  return m?.[1] || null;
}

function findAltitude(text, session) {
  const assigned = session?.assigned?.initialAltitude || session?.cruise || session?.altitude;
  if (assigned) return String(assigned).toLowerCase();

  const m =
    String(text).match(/\bfl\s*(\d{2,3})\b/) ||
    String(text).match(/\bflight level\s*(\d{2,3})\b/) ||
    String(text).match(/\b(\d{4,5})\b/);

  return m?.[1] || null;
}

function findRunway(text, session) {
  const assigned = session?.assigned?.runway || session?.runway;
  if (assigned) return String(assigned).toLowerCase().replace(/^rwy\s*/, '');

  const m = String(text).match(/\brwy\s*(\d{1,2}[lrc]?)\b/) || String(text).match(/\brunway\s*(\d{1,2}[lrc]?)\b/);
  return m?.[1] || null;
}

function altitudeMatches(text, expected) {
  const t = compact(text);
  const e = String(expected).toLowerCase().replace(/[^\d]/g, '');

  if (!e) return true;

  if (t.includes(e)) return true;

  // 16000 may be spoken as one six thousand.
  if (e === '16000' && /one six thousand|16 thousand|sixteen thousand/.test(text)) return true;
  if (e === '15000' && /one five thousand|15 thousand|fifteen thousand/.test(text)) return true;

  // FL310 may appear as 310.
  if (e === '310' && /fl 310|flight level 310|three one zero|tree one zero/.test(text)) return true;

  return false;
}

function runwayMatches(text, expected) {
  const e = String(expected).toLowerCase().replace(/^0?/, '').replace(/\s+/g, '');
  const compactText = compact(text);

  if (compactText.includes(`rwy${e}`)) return true;
  if (compactText.includes(`runway${e}`)) return true;
  if (e === '7' && (/runway 07|rwy 07|zero seven|runway seven|rwy seven/.test(text))) return true;
  if (e === '10' && (/runway 10|rwy 10|one zero|runway ten|rwy ten/.test(text))) return true;

  return false;
}

function routeMatches(text, instructionText, session) {
  const route = String(session?.route || '').toLowerCase();
  const combined = `${instructionText} ${route}`;

  const tokens = combined
    .toUpperCase()
    .split(/\s+/)
    .filter(x => /^[A-Z0-9]{3,7}$/.test(x))
    .filter(x => !['DCT', 'FL310', 'IFR'].includes(x));

  if (tokens.length === 0) {
    return /cleared|destination|direct|as filed/.test(text);
  }

  const important = tokens.slice(0, 5);
  const hits = important.filter(token => text.includes(token.toLowerCase()));

  // Do not require every fix. A route readback is acceptable if it has the clearance phrase
  // and at least one significant route/fix/airway, or says "as filed".
  if (/as filed/.test(text)) return true;
  if (/cleared|destination|direct/.test(text) && hits.length >= 1) return true;

  return hits.length >= Math.min(2, important.length);
}

function compact(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
}
