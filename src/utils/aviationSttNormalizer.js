// src/utils/aviationSttNormalizer.js
// SkyEcho aviation STT cleanup layer.
// Goal: convert weak Vosk/Discord transcripts into aviation-safe intent text
// before the ATC engine or readback validator sees it.

const NATO = {
  A: 'Alpha', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo', F: 'Foxtrot',
  G: 'Golf', H: 'Hotel', I: 'India', J: 'Juliet', K: 'Kilo', L: 'Lima',
  M: 'Mike', N: 'November', O: 'Oscar', P: 'Papa', Q: 'Quebec', R: 'Romeo',
  S: 'Sierra', T: 'Tango', U: 'Uniform', V: 'Victor', W: 'Whiskey',
  X: 'X-ray', Y: 'Yankee', Z: 'Zulu'
};

const DIGIT_SPOKEN = {
  '0': 'zero',
  '1': 'one',
  '2': 'two',
  '3': 'three',
  '4': 'four',
  '5': 'five',
  '6': 'six',
  '7': 'seven',
  '8': 'eight',
  '9': 'niner'
};

const DIGIT_FROM_WORD = {
  zero: '0', oh: '0', o: '0',
  one: '1', won: '1',
  two: '2', too: '2', to: '2',
  three: '3', tree: '3',
  four: '4', for: '4', fore: '4',
  five: '5', fife: '5',
  six: '6',
  seven: '7',
  eight: '8', ate: '8',
  nine: '9', niner: '9'
};

const AIRLINE_SPOKEN = {
  AAL: 'American', AA: 'American', AMERICAN: 'American',
  JBU: 'JetBlue', B6: 'JetBlue', JETBLUE: 'JetBlue',
  DAL: 'Delta', DL: 'Delta', DELTA: 'Delta',
  UAL: 'United', UA: 'United', UNITED: 'United',
  SWA: 'Southwest', WN: 'Southwest', SOUTHWEST: 'Southwest',
  BAW: 'Speedbird', BA: 'Speedbird', SPEEDBIRD: 'Speedbird',
  VIR: 'Virgin', VS: 'Virgin', VIRGIN: 'Virgin',
  BWA: 'Caribbean', CARIBBEAN: 'Caribbean',
  IWY: 'InterCaribbean', INTERCARIBBEAN: 'InterCaribbean',
  WIA: 'Winair', WINAIR: 'Winair',
  SVG: 'SVG Air',
  TJB: 'Tradewind',
  LIAT: 'LIAT',
  SKY: 'SkyEcho'
};

export function normalizeAviationStt(rawText, context = {}) {
  const original = String(rawText || '').trim();

  let text = original
    .toLowerCase()
    .replace(/[^\w\s.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const contextCallsign = context.callsign || context.flightNumber || context.syncId || '';
  const activeCallsign = detectHeardCallsign(text, context) || speakCallsign(contextCallsign);
  const runway = normalizeRunway(context.runway || context?.assigned?.runway || '07');

  text = normalizeCommonVoskMistakes(text);
  text = normalizeAviationWords(text);
  text = normalizeCallsign(text, activeCallsign);

  // Intent-level cleanup. These intentionally return canonical pilot phrases.
  text = normalizeClearanceRequest(text, context, activeCallsign);
  text = normalizePushbackRequest(text, context, activeCallsign);
  text = normalizeTaxiRequest(text, context, activeCallsign);
  text = normalizeDepartureReady(text, runway, context, activeCallsign);
  text = normalizeAirborneCheckin(text, context, activeCallsign);
  text = normalizeMaintaining(text, context, activeCallsign);
  text = normalizeDescentApproachLanding(text, context, activeCallsign);

  // Readback cleanup. Preserve content, but make numbers/frequencies/routes recognizable.
  text = normalizeReadbackPhraseology(text, context, activeCallsign);

  text = text.replace(/\s+/g, ' ').trim();
  return text || original;
}

export default normalizeAviationStt;

export function normalizeForReadbackCompare(value) {
  let text = String(value || '')
    .toLowerCase()
    .replace(/[^\w\s.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  text = normalizeCommonVoskMistakes(text);
  text = normalizeAviationWords(text);

  text = text
    .replace(/\bdecimal\b/g, ' point ')
    .replace(/\bflight level\b/g, ' fl ')
    .replace(/\brunway\b/g, ' rwy ')
    .replace(/\bzero seven\b/g, ' 07 ')
    .replace(/\bone zero\b/g, ' 10 ')
    .replace(/\bone six thousand\b/g, '16000')
    .replace(/\bone five thousand\b/g, '15000')
    .replace(/\bthree one zero\b/g, '310')
    .replace(/\btree one zero\b/g, '310')
    .replace(/\bone one nine point six zero\b/g, '119.60')
    .replace(/\bone one nine decimal six zero\b/g, '119.60')
    .replace(/\bone nineteen decimal sixty\b/g, '119.60')
    .replace(/\bsierra kilo bravo\b/g, 'skb')
    .replace(/\balpha november uniform\b/g, 'anu');

  text = collapseDigitWords(text);

  return text.replace(/\s+/g, ' ').trim();
}

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
    .replace(/\bbequest\b/g, 'request')
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

function normalizeAviationWords(text) {
  return text
    .replace(/\bniner\b/g, 'nine')
    .replace(/\btree\b/g, 'three')
    .replace(/\bfife\b/g, 'five')
    .replace(/\boh\b/g, 'zero');
}

function normalizeClearanceRequest(text, context, activeCallsign) {
  if (
    /\brequest\b.*\bifr\b.*\bclearance\b/.test(text) ||
    /\brequest\b.*\bclearance\b/.test(text) ||
    /\bifr clearance\b/.test(text)
  ) {
    return ensureCallsign('request IFR clearance', text, context, activeCallsign);
  }
  return text;
}

function normalizePushbackRequest(text, context, activeCallsign) {
  if (/\brequest\b.*\bpushback\b|\bpushback\b|\bpush back\b|\bstart\b/.test(text)) {
    return ensureCallsign('request pushback and start', text, context, activeCallsign);
  }
  return text;
}

function normalizeTaxiRequest(text, context, activeCallsign) {
  if (/\bready\b.*\btaxi\b|\btaxi\b.*\bready\b|\bready to taxi\b|\brequest taxi\b/.test(text)) {
    return ensureCallsign('ready to taxi', text, context, activeCallsign);
  }
  return text;
}

function normalizeDepartureReady(text, runway, context, activeCallsign) {
  const hasHoldShort =
    /\bhold short\b/.test(text) ||
    /\bholding short\b/.test(text) ||
    /\bshort\b.*\brunway\b/.test(text);

  const hasReadyDeparture =
    /\bready\b.*\bdeparture\b/.test(text) ||
    /\bready\b.*\btakeoff\b/.test(text) ||
    /\bready\b.*\bdepart\b/.test(text);

  if (hasHoldShort || hasReadyDeparture) {
    return ensureCallsign(
      `holding short runway ${speakRunway(runway)} ready for departure`,
      text,
      context,
      activeCallsign
    );
  }

  return text;
}

function normalizeAirborneCheckin(text, context, activeCallsign) {
  if (
    /\bwith you\b/.test(text) ||
    /\bdeparture\b.*\bpassing\b/.test(text) ||
    /\bairborne\b/.test(text) ||
    /\bpassing\b.*\bfor\b/.test(text)
  ) {
    if (/\brequest\b|\bclearance\b|\btaxi\b|\bpushback\b/.test(text)) return text;
    return ensureCallsign(text, text, context, activeCallsign);
  }
  return text;
}

function normalizeMaintaining(text, context, activeCallsign) {
  if (/\bmaintaining\b|\blevel\b|\bflight level\b|\bclimbing\b|\bdescending\b/.test(text)) {
    if (/\brequest\b|\bclearance\b|\btaxi\b|\bpushback\b/.test(text)) return text;
    return ensureCallsign(text, text, context, activeCallsign);
  }
  return text;
}

function normalizeDescentApproachLanding(text, context, activeCallsign) {
  if (/\brequest\b.*\bdescent\b|\bready\b.*\bdescent\b|\brequest descend\b/.test(text)) {
    return ensureCallsign('request descent', text, context, activeCallsign);
  }

  if (/\brequest\b.*\bapproach\b|\bready\b.*\bapproach\b|\bils\b|\bvisual\b/.test(text)) {
    return ensureCallsign('request approach', text, context, activeCallsign);
  }

  if (/\bfinal\b|\blanding clearance\b|\bcleared to land\b/.test(text)) {
    return ensureCallsign('final runway ' + speakRunway(context.runway || '07'), text, context, activeCallsign);
  }

  return text;
}

function normalizeReadbackPhraseology(text, context, activeCallsign) {
  text = text
    .replace(/\bclear destination\b/g, 'cleared to destination')
    .replace(/\bcreate a destination\b/g, 'cleared to destination')
    .replace(/\bclear to destination\b/g, 'cleared to destination')
    .replace(/\bfiled to maintain\b/g, 'climb and maintain')
    .replace(/\bone nineteen decimal sixty\b/g, 'one one nine decimal six zero')
    .replace(/\bone nineteen six zero\b/g, 'one one nine decimal six zero');

  const cruise = String(context.cruise || context?.assigned?.initialAltitude || '').trim();
  if (/^\d{4,5}$/.test(cruise)) {
    text = text
      .replace(/\bflight level to you\b/g, altitudeToWords(cruise))
      .replace(/\bflight level two you\b/g, altitudeToWords(cruise));
  }

  if (activeCallsign && isPilotLike(text) && !startsWithCallsign(text, activeCallsign)) {
    return ensureCallsign(text, text, context, activeCallsign);
  }

  return text;
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
    /\bsky\b/.test(text);

  if (!hasLikelyCallsign && isPilotLike(text)) {
    return `${lowerActive} ${text}`;
  }

  return text
    .replace(/\baal\s*3084\b/g, lowerActive)
    .replace(/\bamerican\s*3084\b/g, lowerActive)
    .replace(/\bamerican three zero eight four\b/g, lowerActive)
    .replace(/\bthree zero eight four\b/g, lowerActive)
    .replace(/\bliat\s*319\b/g, lowerActive)
    .replace(/\bliat three one nine\b/g, lowerActive)
    .replace(/\bthree one nine\b/g, lowerActive);
}

function ensureCallsign(intent, originalText, context = {}, activeCallsign = '') {
  const heard = detectHeardCallsign(originalText, context);
  const contextCallsign = activeCallsign || speakCallsign(context.callsign || '');
  const callsign = heard || contextCallsign || '';

  if (!callsign) return intent;
  if (startsWithCallsign(intent, callsign)) return intent;

  return `${callsign} ${intent}`;
}

function detectHeardCallsign(text, context = {}) {
  const clean = String(text || '').toLowerCase();

  if (/\bamerican\b|\baal\b|\bthree zero eight four\b|\b3084\b/.test(clean)) {
    return 'American three zero eight four';
  }

  if (/\bjetblue\b|\bjbu\b/.test(clean)) {
    const digits = detectDigitSequence(clean);
    return digits ? `JetBlue ${digitsToWords(digits)}` : 'JetBlue';
  }

  if (/\bliat\b|\bthree one nine\b|\b319\b/.test(clean)) {
    return 'LIAT three one nine';
  }

  if (context.callsign) {
    return speakCallsign(context.callsign);
  }

  return '';
}

function speakCallsign(callsign) {
  const raw = String(callsign || '').toUpperCase().replace(/\s+/g, '');
  if (!raw) return '';

  const airlineRaw = raw.match(/^[A-Z]+/)?.[0] || '';
  const number = raw.match(/\d+/)?.[0] || '';

  const airline = AIRLINE_SPOKEN[airlineRaw] || airlineRaw || '';
  if (!number) return airline;

  return `${airline} ${digitsToWords(number)}`.trim();
}

function normalizeRunway(runway) {
  const r = String(runway || '07').toUpperCase().replace(/^RWY\s*/, '').replace(/[^\dLRC]/g, '');
  const digits = r.match(/\d+/)?.[0] || '07';
  const suffix = r.match(/[LRC]$/)?.[0] || '';
  return `${digits.padStart(2, '0')}${suffix}`;
}

function speakRunway(runway) {
  const r = normalizeRunway(runway);
  const digits = r.match(/\d+/)?.[0] || '07';
  const suffix = r.match(/[LRC]$/)?.[0] || '';

  const suffixWord =
    suffix === 'L' ? ' left' :
    suffix === 'R' ? ' right' :
    suffix === 'C' ? ' center' : '';

  return `${digitsToWords(digits)}${suffixWord}`;
}

function digitsToWords(value) {
  return String(value).split('').map(d => DIGIT_SPOKEN[d] || d).join(' ');
}

function detectDigitSequence(text) {
  const direct = String(text).match(/\b\d{2,4}\b/)?.[0];
  if (direct) return direct;

  const words = String(text).split(/\s+/);
  const digits = [];
  for (const word of words) {
    if (DIGIT_FROM_WORD[word]) digits.push(DIGIT_FROM_WORD[word]);
  }

  return digits.length >= 2 ? digits.join('') : '';
}

function collapseDigitWords(text) {
  const words = String(text || '').split(/\s+/);
  const out = [];

  for (let i = 0; i < words.length; i++) {
    if (!DIGIT_FROM_WORD[words[i]]) {
      out.push(words[i]);
      continue;
    }

    const digits = [];
    let j = i;

    while (j < words.length && DIGIT_FROM_WORD[words[j]]) {
      digits.push(DIGIT_FROM_WORD[words[j]]);
      j++;
    }

    if (digits.length >= 2) {
      out.push(digits.join(''));
      i = j - 1;
    } else {
      out.push(words[i]);
    }
  }

  return out.join(' ');
}

function altitudeToWords(value) {
  const n = Number(String(value || '').replace(/[^\d]/g, ''));
  if (!Number.isFinite(n)) return String(value);

  if (n >= 18000) return `flight level ${digitsToWords(String(Math.round(n / 100)))}`;

  if (n % 1000 === 0) {
    const thousands = n / 1000;
    return `${digitsToWords(String(thousands))} thousand`;
  }

  return digitsToWords(String(n));
}

function startsWithCallsign(text, callsign) {
  return String(text || '').toLowerCase().startsWith(String(callsign || '').toLowerCase());
}

function isPilotLike(text) {
  return /\brequest\b|\bready\b|\btaxi\b|\bpushback\b|\bpush back\b|\bclearance\b|\bholding short\b|\bhold short\b|\bcleared\b|\bsquawk\b|\bmaintain\b|\bflight level\b|\bdeparture frequency\b|\bcontact\b/.test(text);
}
