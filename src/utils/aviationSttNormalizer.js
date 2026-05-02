const DIGIT_WORDS = {
  zero: '0',
  oh: '0',
  one: '1',
  won: '1',
  two: '2',
  too: '2',
  to: '2',
  three: '3',
  tree: '3',
  four: '4',
  for: '4',
  five: '5',
  fife: '5',
  six: '6',
  seven: '7',
  eight: '8',
  ate: '8',
  nine: '9',
  niner: '9'
};

const NUMBER_WORDS = {
  'zero': 'zero',
  'oh': 'zero',
  'one': 'one',
  'won': 'one',
  'two': 'two',
  'too': 'two',
  'to': 'two',
  'three': 'three',
  'tree': 'three',
  'four': 'four',
  'for': 'four',
  'five': 'five',
  'fife': 'five',
  'six': 'six',
  'seven': 'seven',
  'eight': 'eight',
  'ate': 'eight',
  'nine': 'niner',
  'niner': 'niner'
};

export function normalizeAviationStt(rawText, context = {}) {
  let text = String(rawText || '')
    .toLowerCase()
    .replace(/[^\w\s.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const callsign = context.callsign || 'LIAT319';
  const spokenCallsign = context.spokenCallsign || speakCallsign(callsign);
  const runway = String(context.runway || '07').replace(/^0?/, '').padStart(2, '0');

  text = normalizeCommonVoskMistakes(text);
  text = normalizeCallsign(text, spokenCallsign);
  text = normalizeIfrClearance(text);
  text = normalizePushback(text);
  text = normalizeTaxi(text);
  text = normalizeDepartureReady(text, runway);
  text = normalizeReadbacks(text, context);
  text = normalizeFlightLevels(text);
  text = normalizeSquawk(text);
  text = normalizeFrequencies(text);

  text = text
    .replace(/\s+/g, ' ')
    .trim();

  return text || rawText;
}

export default normalizeAviationStt;

function normalizeCommonVoskMistakes(text) {
  return text
    .replace(/\bi fr\b/g, 'ifr')
    .replace(/\bi f r\b/g, 'ifr')
    .replace(/\beye eff are\b/g, 'ifr')
    .replace(/\bfire clearance\b/g, 'ifr clearance')
    .replace(/\bhigher clearance\b/g, 'ifr clearance')
    .replace(/\bour clearance\b/g, 'ifr clearance')
    .replace(/\ba of our clearance\b/g, 'ifr clearance')
    .replace(/\bof our clearance\b/g, 'ifr clearance')
    .replace(/\bfar clearance\b/g, 'ifr clearance')
    .replace(/\bclarence\b/g, 'clearance')
    .replace(/\bclear ants\b/g, 'clearance')
    .replace(/\bpatcher\b/g, 'departure')
    .replace(/\bpacha\b/g, 'departure')
    .replace(/\bbachelor\b/g, 'departure')
    .replace(/\bbadger\b/g, 'departure')
    .replace(/\bpush buttons?\b/g, 'pushback')
    .replace(/\bpush button\b/g, 'pushback')
    .replace(/\bwhole shot\b/g, 'hold short')
    .replace(/\bholding shot\b/g, 'holding short')
    .replace(/\bcalling shot\b/g, 'holding short')
    .replace(/\bwarning shot\b/g, 'holding short')
    .replace(/\bshot runway\b/g, 'short runway')
    .replace(/\brun with\b/g, 'runway')
    .replace(/\brunways?\b/g, 'runway')
    .replace(/\brun with us\b/g, 'runway')
    .replace(/\bbradshaw\b/g, 'bradshaw')
    .replace(/\brobert l breathless\b/g, 'robert l bradshaw')
    .replace(/\brobert l breathless\b/g, 'robert l bradshaw')
    .replace(/\brobert l brad show\b/g, 'robert l bradshaw')
    .replace(/\bsierra kilo bravo\b/g, 'skb')
    .replace(/\balpha november uniform\b/g, 'anu')
    .replace(/\bdirect\b/g, 'direct')
    .replace(/\bthe add\b/g, 'liat')
    .replace(/\bthe at\b/g, 'liat')
    .replace(/\bthe edge\b/g, 'liat')
    .replace(/\bleah\b/g, 'liat')
    .replace(/\blear\b/g, 'liat')
    .replace(/\belliott\b/g, 'liat')
    .replace(/\bjuliet\b/g, 'liat')
    .replace(/\bjetblue twenty eight eighty four\b/g, 'liat three one nine')
    .replace(/\bactually one nine\b/g, 'liat three one nine')
    .replace(/\badd 319\b/g, 'liat three one nine')
    .replace(/\batc one nine\b/g, 'liat three one nine')
    .replace(/\bat the one nine\b/g, 'liat three one nine')
    .replace(/\bthree one name\b/g, 'three one nine')
    .replace(/\bto your name\b/g, 'three one nine')
    .replace(/\btwo your name\b/g, 'three one nine')
    .replace(/\blet the one nine\b/g, 'liat three one nine')
    .replace(/\blet the my name\b/g, 'liat three one nine');
}

function normalizeCallsign(text, spokenCallsign) {
  const hasLikelyCallsign =
    /\bliat\b/.test(text) ||
    /\bthree one nine\b/.test(text) ||
    /\b319\b/.test(text) ||
    /\bone nine\b/.test(text) ||
    /\bsky\b/.test(text);

  if (!hasLikelyCallsign && isPilotRequest(text)) {
    return `${spokenCallsign} ${text}`;
  }

  return text
    .replace(/\bliat\s*319\b/g, spokenCallsign.toLowerCase())
    .replace(/\bliat three one nine\b/g, spokenCallsign.toLowerCase())
    .replace(/\bliat one nine\b/g, spokenCallsign.toLowerCase())
    .replace(/\bthree one nine\b/g, spokenCallsign.toLowerCase());
}

function normalizeIfrClearance(text) {
  if (
    /\brequest\b.*\bifr\b.*\bclearance\b/.test(text) ||
    /\brequest\b.*\bclearance\b/.test(text) ||
    /\bifr clearance\b/.test(text)
  ) {
    return ensureCallsign(text.replace(/.*?(request.*(?:ifr )?clearance).*/, '$1'), text);
  }

  return text;
}

function normalizePushback(text) {
  if (/\bpushback\b|\bpush back\b|\bstart\b/.test(text)) {
    if (!/\brequest\b/.test(text)) text = text.replace(/\b(pushback|push back|start)\b/, 'request pushback and start');
    text = text.replace(/\brequest pushback\b(?! and start)/, 'request pushback and start');
  }

  return text;
}

function normalizeTaxi(text) {
  if (/\bready\b.*\btaxi\b|\btaxi\b.*\bready\b|\bready to taxi\b/.test(text)) {
    return ensureCallsign('ready to taxi', text);
  }

  return text;
}

function normalizeDepartureReady(text, runway) {
  const hasHoldShort =
    /\bhold short\b/.test(text) ||
    /\bholding short\b/.test(text) ||
    /\bshort\b.*\brunway\b/.test(text);

  const hasReadyDeparture =
    /\bready\b.*\bdeparture\b/.test(text) ||
    /\bready\b.*\btakeoff\b/.test(text) ||
    /\bready\b.*\bdepart\b/.test(text);

  if (hasHoldShort || hasReadyDeparture) {
    const spokenRunway = runway === '07' ? 'zero seven' : runway.split('').map(d => d === '0' ? 'zero' : NUMBER_WORDS[d] || d).join(' ');
    return ensureCallsign(`holding short runway ${spokenRunway} ready for departure`, text);
  }

  return text;
}

function normalizeReadbacks(text, context) {
  const route = String(context.route || '').toLowerCase();
  const cruise = String(context.cruise || '').toLowerCase();

  if (/\bcleared\b|\bsquawk\b|\bflight level\b|\bdeparture frequency\b/.test(text)) {
    text = text
      .replace(/\bclear destination\b/g, 'cleared to destination')
      .replace(/\bcreate a destination\b/g, 'cleared to destination')
      .replace(/\bclear to destination\b/g, 'cleared to destination')
      .replace(/\bfiled to maintain\b/g, 'climb and maintain')
      .replace(/\bmaintain flight level to you\b/g, `maintain ${cruise || 'flight level three one zero'}`);
  }

  if (route.includes('g633') || route.includes('g633')) {
    text = text.replace(/\bgo sixty to be\b/g, 'g six three three');
  }

  return text;
}

function normalizeFlightLevels(text) {
  return text
    .replace(/\bflight level three one zero\b/g, 'flight level three one zero')
    .replace(/\bflight level tree one zero\b/g, 'flight level three one zero')
    .replace(/\bflight level to you\b/g, 'flight level three one zero')
    .replace(/\bflight level two you\b/g, 'flight level three one zero')
    .replace(/\bfl three one zero\b/g, 'flight level three one zero')
    .replace(/\bfl tree one zero\b/g, 'flight level three one zero')
    .replace(/\bfl310\b/g, 'flight level three one zero');
}

function normalizeSquawk(text) {
  return text
    .replace(/\bsquawk gone to zero four six\b/g, 'squawk zero four six')
    .replace(/\bsquawk go on to zero four six\b/g, 'squawk zero four six');
}

function normalizeFrequencies(text) {
  return text
    .replace(/\bone one nine decimal six zero\b/g, 'one one nine decimal six zero')
    .replace(/\bone nineteen decimal sixty\b/g, 'one one nine decimal six zero')
    .replace(/\bone nineteen six zero\b/g, 'one one nine decimal six zero');
}

function ensureCallsign(normalizedIntent, originalText) {
  const callsignMatch =
    originalText.match(/\bliat\s+(?:three\s+one\s+nine|one\s+nine|319)\b/) ||
    originalText.match(/\b[a-z]+\s+three\s+one\s+nine\b/);

  const callsign = callsignMatch ? callsignMatch[0] : 'liat three one nine';

  if (normalizedIntent.startsWith(callsign)) return normalizedIntent;

  return `${callsign} ${normalizedIntent}`;
}

function isPilotRequest(text) {
  return /\brequest\b|\bready\b|\btaxi\b|\bpushback\b|\bpush back\b|\bclearance\b|\bholding short\b|\bhold short\b/.test(text);
}

function speakCallsign(callsign) {
  const raw = String(callsign || 'LIAT319')
    .toUpperCase()
    .replace(/\s+/g, '');

  const airline = raw.match(/^[A-Z]+/)?.[0] || 'LIAT';
  const numbers = raw.match(/\d+/)?.[0] || '319';

  const digitWords = {
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

  return `${airline} ${numbers.split('').map(d => digitWords[d] || d).join(' ')}`;
}
