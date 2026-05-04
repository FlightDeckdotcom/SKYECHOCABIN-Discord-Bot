# Render deploy fix

This Discord bot must run as a Render **Background Worker**, not a Web Service.

Why: a Web Service must bind to an HTTP port. This bot logs into Discord and stays alive through the Discord gateway; it does not open a web server. If deployed as a Web Service, Render may build successfully and then fail during deploy because no port is detected.

## Correct Render settings

Service type: Background Worker
Build command: npm install
Start command: npm start
Node version: 20 or later

Required environment variable:
DISCORD_TOKEN=your_bot_token

Optional environment variables:
COMMAND_PREFIX=!sky
TTS_MODE=none
DEFAULT_CALLSIGN=SkyEcho Seven Three Eight
DEFAULT_PHASE=departure

## First test after deploy

In Discord:

!sky session
!sky say maintaining flight label tree for zero
!sky say proceeding own course
!sky say request decent

