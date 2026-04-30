export function validateReadback(session, text) {
  const instruction = session.lastInstruction;
  if (!instruction) return { ok: false, missing: ['no active instruction'], matched: [] };
  const lower = String(text).toLowerCase();
  const matched = [];
  const missing = [];
  for (const item of instruction.required || []) {
    const options = Array.isArray(item.match) ? item.match : [item.match];
    const hit = options.some(x => lower.includes(String(x).toLowerCase()));
    if (hit) matched.push(item.name); else missing.push(item.name);
  }
  return { ok: missing.length === 0, missing, matched };
}
