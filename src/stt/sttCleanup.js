// src/stt/sttCleanup.js
// SkyEcho Discord STT cleanup v3.
// Fixes:
// - BWA 268 no longer becomes SkyEcho zero zero six.
// - Pushback APPROVED readbacks no longer get converted back into "request pushback".
// - Adds Vosk corrections for Caribbean allies/here/lanes -> Caribbean Airlines.
// - Adds 121.90 frequency correction.

const CALLSIGN_PREFIXES = [
  ['BWA', 'Caribbean Airlines'],
  ['JBU', 'JetBlue'],
  ['AAL', 'American'],
  ['DAL', 'Delta'],
  ['UAL', 'United'],
  ['SWA', 'Southwest'],
  ['FFT', 'Frontier'],
  ['NKS', 'Spirit'],
  ['BAW', 'Speedbird'],
  ['KLM', 'KLM'],
  ['AFR', 'Air France'],
  ['WIA', 'Win Air'],
  ['IWY', 'InterCaribbean'],
  ['LIAT', 'Lee At']
];

export function getSyncedPilotCallsign(session = {}) {
  const raw = session.spokenCallsign || session.callsign || session.flightNumber || '';
  const text = String(raw || '').trim();

  if (!text) return 'SkyEcho zero zero six';

  for (const [code, spoken] of CALLSIGN_PREFIXES) {
    const re = new RegExp(`^${code}\\s*(\\d+)`, 'i');
    const match = text.match(re);

    if (match) return `${spoken} ${match[1]}`;
  }

  return text;
}

export function cleanupPilotTranscript(rawText, session = {}) {
  const rawOriginal = String(rawText || '').trim();
  let text = rawOriginal;
  const syncedCallsign = getSyncedPilotCallsign(session);

  const isPushbackReadback =
    /\b(push\s*back|pushback)\b/i.test(rawOriginal) &&
    /\b(approved|approve|roger|face|expect|runway)\b/i.test(rawOriginal) &&
    !/\brequest\b/i.test(rawOriginal);

  text = text
    .replace(/\bi a fire\b/gi, 'IFR')
    .replace(/\beye a fire\b/gi, 'IFR')
    .replace(/\bif our\b/gi, 'IFR')
    .replace(/\bif are\b/gi, 'IFR')
    .replace(/\bif r\b/gi, 'IFR')
    .replace(/\bv f are\b/gi, 'VFR')
    .replace(/\bv fire\b/gi, 'VFR')

    .replace(/\bcaribbean allies to six eight\b/gi, syncedCallsign)
    .replace(/\bcaribbean here to six eight\b/gi, syncedCallsign)
    .replace(/\bcaribbean lanes to six eight\b/gi, syncedCallsign)
    .replace(/\bcaribbean elaine's to six eight\b/gi, syncedCallsign)
    .replace(/\bcaribbean las to six a\b/gi, syncedCallsign)
    .replace(/\bcaribbean airlines to six a\b/gi, syncedCallsign)
    .replace(/\bcaribbean airline to six a\b/gi, syncedCallsign)
    .replace(/\bcaribbean yet as to six a\b/gi, syncedCallsign)
    .replace(/\bcaribbean airways to six a\b/gi, syncedCallsign)
    .replace(/\bcaribbean airlines two six eight\b/gi, syncedCallsign)
    .replace(/\bcaribbean airline two six eight\b/gi, syncedCallsign)
    .replace(/\bcaribbean two six eight\b/gi, syncedCallsign)
    .replace(/\balbion to six\b/gi, syncedCallsign)
    .replace(/\balbion two six\b/gi, syncedCallsign)
    .replace(/\bkb nearly as to succeed\b/gi, syncedCallsign)
    .replace(/\bsky echo zero zero six\b/gi, syncedCallsign)
    .replace(/\bskyecho zero zero six\b/gi, syncedCallsign)

    .replace(/\bone to one point nine four\b/gi, '121.90 for')
    .replace(/\bone to one point nine for\b/gi, '121.90 for')
    .replace(/\bone twenty one point nine\b/gi, '121.90')
    .replace(/\bone two one point nine\b/gi, '121.90')
    .replace(/\bone two one decimal niner zero\b/gi, '121.90')

    .replace(/\brobert l of\b/gi, 'Robert L. Bradshaw')
    .replace(/\brobert l bradshaw\b/gi, 'Robert L. Bradshaw')
    .replace(/\bsame kits\b/gi, 'St. Kitts')
    .replace(/\bsink it's\b/gi, 'St. Kitts')
    .replace(/\balpha november uniform\b/gi, 'ANU')
    .replace(/\balphan november uniform\b/gi, 'ANU')
    .replace(/\ba and you\b/gi, 'ANU')
    .replace(/\ba&u\b/gi, 'ANU')
    .replace(/\bsierra killer bravo\b/gi, 'SKB')
    .replace(/\bsierra kilo bravo\b/gi, 'SKB')
    .replace(/\bskb\b/gi, 'SKB')
    .replace(/\bgolf six three three\b/gi, 'G633')
    .replace(/\bgolf 633\b/gi, 'G633')
    .replace(/\bgoal 633\b/gi, 'G633')

    .replace(/\bzero seven\b/gi, '07')
    .replace(/\bone seven right\b/gi, '17R')
    .replace(/\bzero six zero\b/gi, '6000')
    .replace(/\bplay there was zero six zero\b/gi, '6000')
    .replace(/\bflight level two three zero\b/gi, 'FL230')
    .replace(/\bflight level one three zero\b/gi, 'FL130')

    .replace(/\bgrown\b/gi, 'Ground')
    .replace(/\bclaim and maintain\b/gi, 'climb and maintain')
    .replace(/\bcrime and maintain\b/gi, 'climb and maintain')
    .replace(/\bcrime and man team\b/gi, 'climb and maintain')
    .replace(/\bclimb and man team\b/gi, 'climb and maintain')
    .replace(/\bearn a 07\b/gi, 'runway 07')
    .replace(/\bearn a zero seven\b/gi, 'runway 07')
    .replace(/\bwere alpha\b/gi, 'via Alpha')
    .replace(/\bby alpha\b/gi, 'via Alpha')
    .replace(/\bovershot one or 07\b/gi, 'hold short runway 07')
    .replace(/\bovershot one or zero seven\b/gi, 'hold short runway 07')
    .replace(/\bold shot\b/gi, 'hold short')
    .replace(/\bwhole shot\b/gi, 'hold short')
    .replace(/\bwhole short\b/gi, 'hold short')
    .replace(/\bholding sharp\b/gi, 'holding short')
    .replace(/\bstand-up\b/gi, 'startup')
    .replace(/\bstart up\b/gi, 'startup');

  const mentionsUserCallsign =
    /\bcaribbean\b/i.test(text) ||
    /\bbwa\b/i.test(text) ||
    /\bairlines?\b/i.test(text) ||
    /\b268\b/.test(text) ||
    /\btwo six eight\b/i.test(text);

  if (mentionsUserCallsign && !text.toLowerCase().includes(syncedCallsign.toLowerCase())) {
    text = `${syncedCallsign} ${text}`;
  }

  // IMPORTANT: do not turn readbacks into requests.
  if (isPushbackReadback) {
    text = text.replace(/\brequest pushback and start\b/gi, 'pushback approved');
    if (!/\bapproved\b/i.test(text)) {
      text = `${text} approved`;
    }
  }

  return text.replace(/\s+/g, ' ').trim();
}

export default cleanupPilotTranscript;
