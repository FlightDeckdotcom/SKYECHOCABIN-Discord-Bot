function buildATCResponse(intentResult, session = {}) {
  const callsign = session.callsign || 'aircraft';
  const phase = session.phase || 'enroute';
  const data = intentResult.data || {};

  switch (intentResult.intent) {
    case 'check_in': {
      const level = data.flightLevel || data.altitude || 'your assigned altitude';
      return { text: `${callsign}, radar contact, maintain ${level}, proceed on course.`, nextPhase: phase === 'departure' ? 'enroute' : phase, expectedPilotAction: 'open_request' };
    }
    case 'altitude_report': {
      const level = data.flightLevel || data.altitude || 'reported altitude';
      return { text: `${callsign}, roger, maintain ${level}.`, nextPhase: phase, expectedPilotAction: 'open_request' };
    }
    case 'proceeding_on_course':
      return { text: `${callsign}, roger, proceed on course. Report any altitude change requests.`, nextPhase: 'enroute', expectedPilotAction: 'open_request' };
    case 'request_higher':
      return { text: `${callsign}, climb and maintain flight level three six zero. Report reaching.`, nextPhase: 'enroute', expectedPilotAction: 'readback' };
    case 'request_lower':
      return { text: `${callsign}, descend and maintain flight level three two zero. Report level.`, nextPhase: 'enroute', expectedPilotAction: 'readback' };
    case 'request_descent':
      return { text: `${callsign}, descent approved. Descend pilot's discretion to flight level two four zero.`, nextPhase: 'descent', expectedPilotAction: 'readback' };
    case 'request_vectors':
      return { text: `${callsign}, fly heading two seven zero, vectors for sequencing.`, nextPhase: phase, expectedPilotAction: 'readback' };
    case 'request_direct':
      return { text: `${callsign}, cleared direct next waypoint, resume own navigation.`, nextPhase: 'enroute', expectedPilotAction: 'readback' };
    case 'request_approach':
      return { text: `${callsign}, expect ILS approach. Descend and maintain three thousand. Vectors to final.`, nextPhase: 'approach', expectedPilotAction: 'readback' };
    case 'established_approach':
      return { text: `${callsign}, roger, contact tower on one one eight decimal seven.`, nextPhase: 'tower', expectedPilotAction: 'readback' };
    case 'traffic_in_sight':
      return { text: `${callsign}, maintain visual separation, traffic no factor.`, nextPhase: phase, expectedPilotAction: 'open_request' };
    case 'negative_contact':
      return { text: `${callsign}, roger, traffic twelve o'clock, five miles, same direction. Advise when in sight.`, nextPhase: phase, expectedPilotAction: 'open_request' };
    case 'unable':
      return { text: `${callsign}, roger, maintain present heading and altitude. Advise when able.`, nextPhase: phase, expectedPilotAction: 'open_request' };
    case 'say_again':
      return { text: `${callsign}, I say again, ${session.lastInstruction || 'maintain present altitude and proceed on course'}.`, nextPhase: phase, expectedPilotAction: 'readback' };
    case 'readback':
      return { text: `${callsign}, readback correct.`, nextPhase: phase, expectedPilotAction: 'open_request' };
    default:
      return { text: `${callsign}, I heard you but did not fully understand. Say again using altitude, heading, route, or request.`, nextPhase: phase, expectedPilotAction: 'clarify' };
  }
}

module.exports = { buildATCResponse };
