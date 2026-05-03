// src/atc/intentParser.js
// State-friendly aviation intent parser.
// Readback only wins when the engine is actually awaiting a readback.

const tests = [
  ['say_again', /\b(say again|repeat|confirm|read back|what was that)\b/i],

  ['request_clearance', /\b(request|need|like|ready for|looking for).*\b(ifr|clearance)\b/i],
  ['request_pushback', /\b(pushback|push back|start|engine start)\b/i],
  ['request_taxi', /\b(ready to taxi|request taxi|taxi request|ready for taxi)\b/i],
  ['ready_departure', /\b(holding short|hold short|ready).*\b(departure|takeoff|runway)\b/i],

  // Do not let the word "departure" alone trigger airborne check-in while on the ground.
  ['airborne_checkin', /\b(with you|airborne|passing|climbing through|out of|departure radar)\b/i],

  ['maintaining', /\b(maintaining|level|flight level|climbing|descending)\b/i],
  ['request_descent', /\b(request|ready|like).*\b(descent|descend|lower)\b/i],
  ['request_approach', /\b(request|ready|expect).*\b(approach|ils|visual|rnav)\b/i],
  ['request_landing', /\b(final|landing clearance|cleared to land)\b/i],

  ['readback', /\b(cleared|squawk|runway|taxi|contact|flight level|heading|altitude|line up|takeoff|departure frequency|maintain|direct|as filed|hold short)\b/i]
];

export function parseIntent(text, session = {}) {
  const clean = String(text || '').trim();

  // Important: readback should be gated by session.awaitingReadback.
  if (session.awaitingReadback) {
    const readbackRx = /\b(cleared|squawk|runway|taxi|contact|flight level|heading|altitude|line up|takeoff|departure frequency|maintain|direct|as filed|hold short|roger)\b/i;
    if (readbackRx.test(clean)) return { intent: 'readback', confidence: 0.92 };
  }

  for (const [intent, rx] of tests) {
    if (intent === 'readback' && !session.awaitingReadback) continue;
    if (rx.test(clean)) return { intent, confidence: 0.84 };
  }

  return { intent: 'unknown', confidence: 0.3 };
}
