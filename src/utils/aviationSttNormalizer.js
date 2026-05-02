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
  zero: 'zero',
  oh: 'zero',
  one: 'one',
  won: 'one',
  two: 'two',
  too: 'two',
  to: 'two',
  three: 'three',
  tree: 'three',
  four: 'four',
  for: 'four',
  five: 'five',
  fife: 'five',
  six: 'six',
  seven: 'seven',
  eight: 'eight',
  ate: 'eight',
  nine: 'niner',
  niner: 'niner'
};

const AIRLINE_SPOKEN = {
  AAL: 'American',
  AA: 'American',
  AMERICAN: 'American',

  JBU: 'JetBlue',
  B6: 'JetBlue',
  JETBLUE: 'JetBlue',

  DAL: 'Delta',
  DL: 'Delta',
  DELTA: 'Delta',

  UAL: 'United',
  UA: 'United',
  UNITED: 'United',

  SWA: 'Southwest',
  WN: 'Southwest',
  SOUTHWEST: 'Southwest',

  BAW: 'Speedbird',
  BA: 'Speedbird',
  SPEEDBIRD: 'Speedbird',

  VIR: 'Virgin',
  VS: 'Virgin',
  VIRGIN: 'Virgin',

  LIAT: 'LIAT',
  WINAIR: 'Winair',
  WINAIR: 'Winair',
  CARIBBEAN: 'Caribbean',
  BWA: 'Caribbean',
  INTERCARIBBEAN: 'InterCaribbean'
};

export function normalizeAviationStt(rawText, context = {}) {
  const originalRaw = String(rawText || '');

  let text = originalRaw
    .toLowerCase()
    .replace(/[^\w\s.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const contextCallsign = context.callsign || '';
  const contextSpokenCallsign =
    context.spokenCallsign && !looksLikeRawCallsign(context.spokenCallsign)
      ? context.spokenCallsign
      : speakCallsign(contextCallsign);

  const runway = String(context.runway || '07')
    .replace(/^0?/, '')
    .padStart(2, '0');

  text = normalizeCommonVoskMistakes(text);

  const heardCallsign = detectHeardCallsign(text, context);
  const activeCallsign = heardCallsign || contextSpokenCallsign || '';

  text = normalizeCallsign(text, activeCallsign);
  text = normalizeIfrClearance(text, context, activeCallsign);
  text = normalizePushback(text, context, activeCallsign);
  text = normalizeTaxi(text, context, activeCallsign);
  text = normalizeDepartureReady(text, runway, context, activeCallsign);
  text = normalizeReadbacks(text, context, activeCallsign);
  text = normalizeFlightLevels(text, context);
  text = normalizeSquawk(text);
  text = normalizeFrequencies(text);

  text = text
    .replace(/\s+/g, ' ')
    .trim();

  return text || originalRaw;
}

export default normalizeAviationStt;

function normalizeCommonVoskMistakes(text) {
  return text
    .replace(/\bi fr\b/g, 'ifr')
    .replace(/\bi f r\b/g, 'ifr')
    .replace(/\beye eff are\b/g, 'ifr')
    .replace(/\ba fire clearance\b/g, 'ifr clearance')
    .replace(/\bfire clearance\b/g, 'ifr clearance')
    .replace(/\bhigher clearance\b/g, 'ifr clearance')
    .replace(/\bour clearance\b/g, 'ifr clearance')
    .replace(/\ba of our clearance\b/g, 'ifr clearance')
    .replace(/\bof our clearance\b/g, 'ifr clearance')
    .replace(/\bfar clearance\b/g, 'ifr clearance')
    .replace(/\bfull requests\b/g, 'request')
    .replace(/\brequests a\b/g, 'request')
    .replace(/\brequests i\b/g, 'request i')
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
    .replace(/\brun with us\b/g, 'runway')
    .replace(/\brun with\b/g, 'runway')
    .replace(/\brunways?\b/g, 'runway')
    .replace(/\brobert l breathless\b/g, 'robert l bradshaw')
    .replace(/\brobert l brad show\b/g, 'robert l bradshaw')
    .replace(/\bsierra kilo bravo\b/g, 'skb')
    .replace(/\balpha november uniform\b/g, 'anu')
    .replace(/\bgo sixty to be\b/g, 'g six three three')
    .replace(/\bfees you are\b/g, 'three zero eight four')
    .replace(/\bfees your\b/g, 'three zero eight four')
    .replace(/\bfee zero eight four\b/g, 'three zero eight four')
    .replace(/\bthe add\b/g, 'liat')
    .replace(/\bthe at\b/g, 'liat')
    .replace(/\bthe edge\b/g, 'liat')
    .replace(/\bleah\b/g, 'liat')
    .replace(/\blear\b/g, 'liat')
    .replace(/\belliott\b/g, 'liat')
    .replace(/\bjuliet\b/g, 'liat')
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

function normalizeCallsign(text, activeCallsign) {
  if (!activeCallsign) return text;

  const lowerActive = activeCallsign.toLowerCase();

  const hasLikelyCallsign =
    /\bamerican\b/.test(text) ||
    /\baal\b/.test(text) ||
    /\bthree zero eight four\b/.test(text) ||
    /\b3084\b/.test(text) ||
    /\bliat\b/.test(text) ||
    /\bthree one nine\b/.test(text) ||
    /\b319\b/.test(text) ||
    /\bone nine\b/.test(text) ||
    /\bsky\b/.test(text);

  if (!hasLikelyCallsign && isPilotRequest(text)) {
    return `${lowerActive} ${text}`;
  }

  return text
    .replace(/\baal\s*3084\b/g, lowerActive)
    .replace(/\bamerican\s*3084\b/g, lowerActive)
    .replace(/\bamerican three zero eight four\b/g, lowerActive)
    .replace(/\bthree zero eight four\b/g, lowerActive)
    .replace(/\bliat\s*319\b/g, lowerActive)
    .replace(/\bliat three one nine\b/g, lowerActive)
    .replace(/\bliat one nine\b/g, lowerActive)
    .replace(/\bthree one nine\b/g, lowerActive);
}

function normalizeIfrClearance(text, context = {}, activeCallsign = '') {
  if (
    /\brequest\b.*\bifr\b.*\bclearance\b/.test(text) ||
    /\brequest\b.*\bclearance\b/.test(text) ||
    /\bifr clearance\b/.test(text)
  ) {
    const intent = 'request IFR clearance';
    return ensureCallsign(intent, text, context, activeCallsign);
  }

  return text;
}

function normalizePushback(text, context = {}, activeCallsign = '') {
  if (/\bpushback\b|\bpush back\b|\bstart\b/.test(text)) {
    return ensureCallsign('request pushback and start', text, context, activeCallsign);
  }

  return text;
}

function normalizeTaxi(text, context = {}, activeCallsign = '') {
  if (/\bready\b.*\btaxi\b|\btaxi\b.*\bready\b|\bready to taxi\b/.test(text)) {
    return ensureCallsign('ready to taxi', text, context, activeCallsign);
  }

  return text;
}

function normalizeDepartureReady(text, runway, context = {}, activeCallsign = '') {
  const hasHoldShort =
    /\bhold short\b/.test(text) ||
    /\bholding short\b/.test(text) ||
    /\bshort\b.*\brunway\b/.test(text);

  const hasReadyDeparture =
    /\bready\b.*\bdeparture\b/.test(text) ||
    /\bready\b.*\btakeoff\b/.test(text) ||
    /\bready\b.*\bdepart\b/.test(text);

  if (hasHoldShort || hasReadyDeparture) {
    const spokenRunway =
      runway === '07'
        ? 'zero seven'
        : runway
            .split('')
            .map(d => (d === '0' ? 'zero' : NUMBER_WORDS[d] || d))
            .join(' ');

    return ensureCallsign(
      `holding short runway ${spokenRunway} ready for departure`,
      text,
      context,
      activeCallsign
    );
  }

  return text;
}

function normalizeReadbacks(text, context = {}, activeCallsign = '') {
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

  if (route.includes('g633')) {
    text = text.replace(/\bgo sixty to be\b/g, 'g six three three');
  }

  if (activeCallsign && isPilotRequest(text) && !startsWithCallsign(text, activeCallsign)) {
    return ensureCallsign(text, text, context, activeCallsign);
  }

  return text;
}

function normalizeFlightLevels(text, context = {}) {
  const cruise = String(context.cruise || '').trim();

  if (/^\d{4,5}$/.test(cruise)) {
    const altitudeWords = altitudeToWords(cruise);
    text = text.replace(/\bflight level to you\b/g, altitudeWords);
    text = text.replace(/\bflight level two you\b/g, altitudeWords);
  }

  return text
    .replace(/\bflight level tree one zero\b/g, 'flight level three one zero')
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

function ensureCallsign(normalizedIntent, originalText, context = {}, activeCallsign = '') {
  const heardCallsign = detectHeardCallsign(originalText, context);

  const contextCallsign =
    activeCallsign ||
    heardCallsign ||
    (
      context.spokenCallsign && !looksLikeRawCallsign(context.spokenCallsign)
        ? context.spokenCallsign
        : speakCallsign(context.callsign || '')
    );

  const callsign = heardCallsign || contextCallsign || '';

  if (!callsign) return normalizedIntent;

  if (startsWithCallsign(normalizedIntent, callsign)) {
    return normalizedIntent;
  }

  return `${callsign} ${normalizedIntent}`;
}

function detectHeardCallsign(text, context = {}) {
  const clean = String(text || '').toLowerCase();

  if (
    /\bamerican\b/.test(clean) ||
    /\baal\b/.test(clean) ||
    /\bthree zero eight four\b/.test(clean) ||
    /\b3084\b/.test(clean)
  ) {
    return 'American three zero eight four';
  }

  if (
    /\bjetblue\b/.test(clean) ||
    /\bjbu\b/.test(clean)
  ) {
    const digits = detectDigitSequence(clean);
    return digits ? `JetBlue ${digitsToWords(digits)}` : 'JetBlue';
  }

  if (
    /\bliat\b/.test(clean) ||
    /\bthree one nine\b/.test(clean) ||
    /\b319\b/.test(clean)
  ) {
    return 'LIAT three one nine';
  }

  if (context.callsign) {
    return speakCallsign(context.callsign);
  }

  return '';
}

function startsWithCallsign(text, callsign) {
  return String(text || '')
    .toLowerCase()
    .startsWith(String(callsign || '').toLowerCase());
}

function isPilotRequest(text) {
  return /\brequest\b|\bready\b|\btaxi\b|\bpushback\b|\bpush back\b|\bclearance\b|\bholding short\b|\bhold short\b/.test(text);
}

function looksLikeRawCallsign(value) {
  const v = String(value || '').trim();
  return /^[A-Z]{2,4}\s*\d+$/i.test(v);
}

function speakCallsign(callsign) {
  const raw = String(callsign || '')
    .toUpperCase()
    .replace(/\s+/g, '');

  if (!raw) return '';

  const airlineRaw = raw.match(/^[A-Z]+/)?.[0] || '';
  const numbers = raw.match(/\d+/)?.[0] || '';

  const airline = AIRLINE_SPOKEN[airlineRaw] || airlineRaw || '';

  if (!numbers) return airline;

  return `${airline} ${digitsToWords(numbers)}`.trim();
}

function digitsToWords(value) {
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

  return String(value)
    .split('')
    .map(d => digitWords[d] || d)
    .join(' ');
}

function detectDigitSequence(text) {
  const direct = String(text).match(/\b\d{2,4}\b/)?.[0];
  if (direct) return direct;

  const words = String(text).split(/\s+/);
  const digits = [];

  for (const word of words) {
    if (DIGIT_WORDS[word]) digits.push(DIGIT_WORDS[word]);
  }

  return digits.length >= 2 ? digits.join('') : '';
}

function altitudeToWords(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) return String(value);

  if (n === 16000) return 'one six thousand';
  if (n === 15000) return 'one five thousand';
  if (n === 10000) return 'one zero thousand';

  return digitsToWords(String(value));
}
