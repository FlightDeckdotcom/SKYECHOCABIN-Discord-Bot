export function log(scope, message, data = undefined) {
  const ts = new Date().toISOString();
  if (data === undefined) console.log(`[${ts}] [${scope}] ${message}`);
  else console.log(`[${ts}] [${scope}] ${message}`, data);
}

export function warn(scope, message, data = undefined) {
  const ts = new Date().toISOString();
  if (data === undefined) console.warn(`[${ts}] [${scope}] WARN: ${message}`);
  else console.warn(`[${ts}] [${scope}] WARN: ${message}`, data);
}

export function error(scope, message, data = undefined) {
  const ts = new Date().toISOString();
  if (data === undefined) console.error(`[${ts}] [${scope}] ERROR: ${message}`);
  else console.error(`[${ts}] [${scope}] ERROR: ${message}`, data);
}
