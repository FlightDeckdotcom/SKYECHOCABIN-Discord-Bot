const tests = [
  ['request_clearance', /\b(request|need|like).*\b(ifr|clearance)\b/i],
  ['request_pushback', /\b(pushback|push back)\b/i],
  ['request_taxi', /\b(taxi|ready to taxi)\b/i],
  ['ready_departure', /\b(ready|holding short|number one).*\b(departure|takeoff|runway)\b/i],
  ['airborne_checkin', /\b(airborne|with you|passing|departure)\b/i],
  ['maintaining', /\b(maintaining|level|flight level|climbing|descending)\b/i],
  ['request_descent', /\b(request|ready).*\b(descent|descend)\b/i],
  ['request_approach', /\b(request|ready).*\b(approach|ils|visual)\b/i],
  ['request_landing', /\b(landing clearance|cleared to land|final)\b/i],
  ['say_again', /\b(say again|repeat|confirm)\b/i],
  ['readback', /\b(cleared|squawk|runway|taxi|contact|flight level|heading|altitude|line up|takeoff|departure frequency)\b/i]
];

export function parseIntent(text) {
  const clean = String(text || '').trim();
  for (const [intent, rx] of tests) if (rx.test(clean)) return { intent, confidence: 0.8 };
  return { intent: 'unknown', confidence: 0.3 };
}
