import { createSession } from '../src/atc/sessionStore.js';
import { handlePilotText } from '../src/atc/atcEngine.js';
import { seedTraffic, nextTrafficTransmission } from '../src/traffic/syntheticTraffic.js';

const s = createSession({ callsign: 'LIAT319', route: 'TKPK SKB G633 ANU DCT TAPA', cruise: 'FL310' });
seedTraffic(s, 'medium');
const a = handlePilotText(s, 'Clearance, LIAT 319, request IFR clearance to TAPA.');
const b = nextTrafficTransmission(s);
console.log('ATC:', a.text);
console.log('TRAFFIC:', b.text);
console.log('OK self-check completed.');
