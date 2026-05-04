const { resolveATCIntent } = require('./atc/intentResolver');
const { buildATCResponse } = require('./atc/responseEngine');

const session = {
  callsign: 'SkyEcho Seven Three Eight',
  phase: 'enroute',
  expectedPilotAction: 'open_request',
  lastInstruction: 'SkyEcho Seven Three Eight, radar contact, proceed on course.'
};

const tests = [
  'proceeding own course',
  'maintain in flight label tree for zero',
  'level three forty',
  'request decent',
  'request higher',
  'traffic insight',
  'negative contact',
  'established localizer',
  'say again',
  'with you flight level three two zero'
];

for (const text of tests) {
  const intent = resolveATCIntent(text, session);
  const reply = buildATCResponse(intent, session);
  console.log('\nPILOT:', text);
  console.log('INTENT:', intent);
  console.log('ATC:', reply.text);
}
