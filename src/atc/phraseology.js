export function digits(text) {
  return String(text).split('').map(ch => ({0:'zero',1:'one',2:'two',3:'three',4:'four',5:'five',6:'six',7:'seven',8:'eight',9:'niner'}[ch] ?? ch)).join(' ');
}

export function flightLevel(fl) {
  const clean = String(fl).toUpperCase().replace(/[^0-9]/g, '');
  return clean ? `flight level ${digits(clean)}` : String(fl);
}

export function frequency(freq) {
  return String(freq).replace('.', ' decimal ');
}

export function squawk(code) {
  return `squawk ${digits(code)}`;
}

export function routeSpeak(route) {
  return String(route)
    .replace(/\bDCT\b/gi, 'direct')
    .replace(/\bANU\b/g, 'Alpha November Uniform')
    .replace(/\bSKB\b/g, 'Sierra Kilo Bravo')
    .replace(/\bTKPK\b/g, 'Robert L. Bradshaw')
    .replace(/\bTAPA\b/g, 'V. C. Bird');
}
