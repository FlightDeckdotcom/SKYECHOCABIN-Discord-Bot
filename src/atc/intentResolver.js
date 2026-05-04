const NUMBER_WORDS = {
  zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9'
};

const NORMALIZATION_RULES = [
  [/\bflight label\b/g, 'flight level'], [/\bflight laval\b/g, 'flight level'], [/\bflite level\b/g, 'flight level'],
  [/\bflight lebel\b/g, 'flight level'], [/\bflight leveled\b/g, 'flight level'], [/\bfright level\b/g, 'flight level'],
  [/\btree\b/g, 'three'], [/\bfree\b/g, 'three'], [/\bfor\b/g, 'four'], [/\bfore\b/g, 'four'],
  [/\bto\b/g, 'two'], [/\btoo\b/g, 'two'], [/\btu\b/g, 'two'], [/\bwon\b/g, 'one'], [/\bwan\b/g, 'one'],
  [/\bniner\b/g, 'nine'], [/\bdecent\b/g, 'descent'], [/\bdescend\b/g, 'descent'], [/\bdescending\b/g, 'descent'],
  [/\bclime\b/g, 'climb'], [/\bclimbing\b/g, 'climb'], [/\bmaintain in\b/g, 'maintaining'],
  [/\bown course\b/g, 'on course'], [/\bon cores\b/g, 'on course'], [/\bon coarse\b/g, 'on course'],
  [/\bproceeding own\b/g, 'proceeding on'], [/\bwitch you\b/g, 'with you'], [/\bwith ya\b/g, 'with you'],
  [/\binsite\b/g, 'in sight'], [/\binsight\b/g, 'in sight'], [/\bsite\b/g, 'sight'], [/\bcopy that\b/g, 'copy'], [/\broger that\b/g, 'roger'],
  [/\bvectors?\b/g, 'vectors'], [/\bhead in\b/g, 'heading']
];

function normalizeATCText(raw = '') {
  let text = String(raw).toLowerCase();
  for (const [pattern, replacement] of NORMALIZATION_RULES) text = text.replace(pattern, replacement);
  text = text.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return text;
}

function wordToDigit(word) { return NUMBER_WORDS[word] ?? null; }

function extractFlightLevel(text) {
  const direct = text.match(/\b(?:fl|flight level|level)\s?(\d{2,3})\b/);
  if (direct) return `FL${direct[1].padStart(3, '0')}`;
  const words = text.match(/\b(?:flight level|level|maintaining|maintain|climb|descent|passing|leaving)?\s*(zero|oh|one|two|three|four|five|six|seven|eight|nine)\s+(zero|oh|one|two|three|four|five|six|seven|eight|nine)(?:\s+(zero|oh|one|two|three|four|five|six|seven|eight|nine))?\b/);
  if (words) {
    const nums = words.slice(1).filter(Boolean).map(wordToDigit).join('');
    if (nums.length === 3) return `FL${nums}`;
    if (nums.length === 2) return `FL${nums}0`;
  }
  const common = [
    [/\bthree forty\b/, 'FL340'], [/\bthree four zero\b/, 'FL340'], [/\bthree two zero\b/, 'FL320'],
    [/\bthree one zero\b/, 'FL310'], [/\btwo four zero\b/, 'FL240'], [/\btwo one zero\b/, 'FL210']
  ];
  for (const [pattern, fl] of common) if (pattern.test(text)) return fl;
  return null;
}

function extractAltitude(text) {
  const numeric = text.match(/\b(\d{4,5})\b/);
  if (numeric) return `${numeric[1]} feet`;
  const phrases = [
    ['one thousand', '1,000 feet'], ['two thousand', '2,000 feet'], ['three thousand', '3,000 feet'],
    ['four thousand', '4,000 feet'], ['five thousand', '5,000 feet'], ['six thousand', '6,000 feet'],
    ['seven thousand', '7,000 feet'], ['eight thousand', '8,000 feet'], ['nine thousand', '9,000 feet'],
    ['ten thousand', '10,000 feet'], ['eleven thousand', '11,000 feet'], ['twelve thousand', '12,000 feet'],
    ['one two thousand', '12,000 feet'], ['two one thousand', '21,000 feet']
  ];
  for (const [phrase, value] of phrases) if (text.includes(phrase)) return value;
  return null;
}

function extractHeading(text) {
  const direct = text.match(/\bheading\s?(\d{2,3})\b/);
  if (direct) return direct[1].padStart(3, '0');
  return null;
}

function scoreText(text, keywords) {
  return keywords.reduce((score, keyword) => score + (text.includes(keyword) ? 1 : 0), 0);
}

function resolveATCIntent(rawText, session = {}) {
  const text = normalizeATCText(rawText);
  const flightLevel = extractFlightLevel(text);
  const altitude = extractAltitude(text);
  const heading = extractHeading(text);
  const phase = session.phase || 'unknown';
  const lastInstruction = session.lastInstruction || '';
  const expected = session.expectedPilotAction || 'none';
  const candidates = [];
  const add = (intent, score, data = {}) => { if (score > 0) candidates.push({ intent, score, data }); };

  add('check_in', scoreText(text, ['with you', 'checking in', 'check in', 'departure', 'center', 'approach']) + ((flightLevel || altitude) ? 1 : 0), { flightLevel, altitude });
  add('altitude_report', scoreText(text, ['maintaining', 'maintain', 'level', 'passing', 'leaving', 'flight level']) + ((flightLevel || altitude) ? 3 : 0), { flightLevel, altitude });
  add('proceeding_on_course', scoreText(text, ['on course', 'proceeding on course', 'direct', 'resume own navigation', 'own navigation', 'proceed']), {});
  add('request_higher', scoreText(text, ['request higher', 'higher', 'climb higher', 'step climb', 'higher altitude']), {});
  add('request_lower', scoreText(text, ['request lower', 'lower', 'lower altitude']), {});
  add('request_descent', scoreText(text, ['request descent', 'ready for descent', 'descent when able', 'start descent']) + (text.includes('request descent') ? 3 : 0), {});
  add('request_vectors', scoreText(text, ['request vectors', 'vectors', 'vector', 'heading']), { heading });
  add('request_direct', scoreText(text, ['request direct', 'direct to', 'direct']), {});
  add('request_approach', scoreText(text, ['request approach', 'approach', 'ils', 'visual', 'rnav', 'landing']), {});
  add('established_approach', scoreText(text, ['established', 'localizer', 'glide slope', 'glideslope', 'final']), {});
  add('traffic_in_sight', scoreText(text, ['traffic in sight', 'in sight', 'visual contact']) + (text.includes('traffic in sight') ? 2 : 0), {});
  add('negative_contact', scoreText(text, ['negative contact', 'looking', 'not in sight', 'no contact']) + (text.includes('negative contact') ? 2 : 0), {});
  add('unable', scoreText(text, ['unable', 'cannot', 'cant', "can't", 'negative unable']), {});
  add('say_again', scoreText(text, ['say again', 'repeat', 'confirm', 'unable copy', 'missed']) + (text.includes('say again') ? 2 : 0), {});
  add('readback', scoreText(text, ['wilco', 'roger', 'copy', 'squawk', 'heading', 'runway', 'cleared']) + (expected === 'readback' ? 2 : 0) + (heading ? 1 : 0), { flightLevel, altitude, heading });

  if (['departure', 'enroute', 'descent'].includes(phase)) {
    for (const c of candidates) if (['altitude_report', 'proceeding_on_course', 'request_higher', 'request_lower', 'request_descent', 'request_direct', 'check_in'].includes(c.intent)) c.score += 2;
  }
  if (/radar contact|proceed on course|resume own navigation/i.test(lastInstruction)) {
    for (const c of candidates) {
      if (c.intent === 'proceeding_on_course') c.score += 4;
      if (c.intent === 'altitude_report') c.score += 2;
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || best.score < 2) return { intent: 'unknown', confidence: 'low', rawText, normalizedText: text, data: {} };
  return { intent: best.intent, confidence: best.score >= 5 ? 'high' : 'medium', rawText, normalizedText: text, data: best.data || {} };
}

module.exports = { normalizeATCText, resolveATCIntent, extractFlightLevel, extractAltitude, extractHeading };
