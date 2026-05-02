// SkyEcho Aviation STT Normalizer
// Purpose: clean Vosk/Discord STT before sending text into the SkyEcho ATC engine.
// Import this in src/bot/discordBot.js and pass normalizeAviationTranscript(stt.text, session) to handlePilotText().

export function normalizeAviationTranscript(rawText = '', session = {}) {
  let t = String(rawText || '')
    .toLowerCase()
    .replace(/[.,!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const callsign = String(session?.callsign || session?.spokenCallsign || 'LIAT319').toUpperCase().replace(/\s+/g, '');
  const spokenCallsign = speakCallsign(callsign).toLowerCase();

  const fixes = [
    // LIAT / callsign hallucinations from Vosk
    [/\b(the add|the at|the actually|elliott|leah|lee at|li at|juliet|see at|he had|let the|roger let the|one vip|christ i are far greater and the add)\b/g, 'liat'],
    [/\b(tree one name|three one name|to your name|one nine|three one nine|the one nine|319|three nineteen)\b/g, 'three one nine'],

    // IFR clearance requests
    [/\b(i a fire|i fire|our clarence|our clearance|a of our clearance|i have our clarence|i have our clearance|i fr clearance|i f r clearance|ifr clearance|of our clearance)\b/g, 'ifr clearance'],
    [/\b(requests?|bequest|request a|requests a)\s+(ifr clearance|i fr clearance|i fire clearance|fire clearance)\b/g, 'request ifr clearance'],
    [/\bclarence\b/g, 'clearance'],

    // Clearance/readback route words
    [/\brobert l breathless\b/g, 'robert l bradshaw'],
    [/\brobert l breathless iirc\b/g, 'robert l bradshaw sierra kilo bravo'],
    [/\bsierra walk\b/g, 'sierra kilo bravo'],
    [/\beither walk\b/g, 'sierra kilo bravo'],
    [/\bgo sixty to be\b/g, 'g six three three'],
    [/\bgo six three three\b/g, 'g six three three'],
    [/\bg six thirty three\b/g, 'g six three three'],
    [/\bof and of a uniform\b/g, 'alpha november uniform'],
    [/\buniform direct that has filed\b/g, 'uniform direct'],

    // Taxi / runway / hold short
    [/\brun with us seven\b/g, 'runway zero seven'],
    [/\brunways? you are seven\b/g, 'runway zero seven'],
    [/\bwhen with he was seven\b/g, 'runway zero seven'],
    [/\bwith you seven\b/g, 'zero seven'],
    [/\bwe zero seven\b/g, 'zero seven'],
    [/\byou seven\b/g, 'zero seven'],
    [/\bwhen he was seven\b/g, 'zero seven'],
    [/\bwere seven\b/g, 'zero seven'],
    [/\boh seven\b/g, 'zero seven'],
    [/\bo taxi\b/g, 'taxi'],
    [/\balpha or shot\b/g, 'alpha hold short'],
    [/\bwhole shot\b/g, 'hold short'],
    [/\bor shot\b/g, 'hold short'],
    [/\ba shot\b/g, 'hold short'],
    [/\bwarning shot\b/g, 'holding short'],
    [/\bcalling short\b/g, 'holding short'],
    [/\bcalling shot\b/g, 'holding short'],
    [/\bhold shot\b/g, 'hold short'],
    [/\bholding shot\b/g, 'holding short'],

    // Departure/takeoff mishears
    [/\bready for the patch\b/g, 'ready for departure'],
    [/\bready for the pacha\b/g, 'ready for departure'],
    [/\bready for the bachelor\b/g, 'ready for departure'],
    [/\bready for the badger\b/g, 'ready for departure'],
    [/\bbachelor\b/g, 'departure'],
    [/\bbadger\b/g, 'departure'],
    [/\bpacha\b/g, 'departure'],
    [/\bpatch\b/g, 'departure'],

    // Frequencies / squawk / altitude
    [/\bone one niner\b/g, 'one one niner'],
    [/\bflight level to you unless\b/g, 'flight level three one zero'],
    [/\byou have gone to zero four six\b/g, 'squawk zero four six'],
    [/\bsquak\b/g, 'squawk'],
    [/\bsquark\b/g, 'squawk']
  ];

  for (const [rx, replacement] of fixes) t = t.replace(rx, replacement);

  // If Vosk caught the intended callsign poorly, standardize it to current session callsign.
  if (/\b(liat|the add|the at|elliott|leah|juliet|see at)\b/.test(t) && /\b(three one nine|one nine)\b/.test(t)) {
    t = t.replace(/\b(liat\s*)?(three one nine|one nine)\b/g, spokenCallsign);
  }

  // Common intent salvage rules.
  if (/\brequest\b/.test(t) && /\b(ifr|clearance|fire)\b/.test(t)) {
    t = `${spokenCallsign} request ifr clearance`;
  }

  if (/\bready to taxi\b/.test(t) || (/\btaxi\b/.test(t) && /\bready\b/.test(t))) {
    t = `${spokenCallsign} ready to taxi`;
  }

  if ((/\bhold short|holding short\b/.test(t) || /\bcalling short\b/.test(t)) && /\bzero seven|runway\b/.test(t) && /\bready|departure\b/.test(t)) {
    t = `${spokenCallsign} holding short runway zero seven ready for departure`;
  }

  return t.replace(/\s+/g, ' ').trim();
}

export function containsWakeCall(rawText = '', controllerName = '') {
  const t = String(rawText || '').toLowerCase();
  const c = String(controllerName || '').toLowerCase();
  const wakeWords = [
    'bradshaw tower',
    'bradshaw ground',
    'bradshaw delivery',
    'bradshaw departure',
    'bradshaw approach',
    'tower',
    'ground',
    'delivery',
    'departure',
    'approach',
    c
  ].filter(Boolean);
  return wakeWords.some(w => t.includes(w));
}

function speakCallsign(callsign) {
  const raw = String(callsign || 'LIAT319').toUpperCase().replace(/\s+/g, '');
  if (raw === 'LIAT319') return 'LIAT three one nine';
  return raw
    .replace(/^LIAT/, 'LIAT ')
    .replace(/^JBU/, 'JetBlue ')
    .replace(/^AAL/, 'American ')
    .replace(/^BAW/, 'Speedbird ')
    .replace(/(\D)(\d)/, '$1 $2')
    .trim();
}
