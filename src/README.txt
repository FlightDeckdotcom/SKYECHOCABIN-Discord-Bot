SkyEcho Discord Sync Patch

Upload/copy these changes into the Discord bot repo, not the Piper repo.

1) Add this new file:
   src/discord/discordSyncStore.js

2) Patch src/server.js:
   Open snippets/server-import-and-routes.js.
   Add the import near the top of src/server.js.
   Add the two routes before app.get('*', ...).

3) Patch the SkyEcho web app index.html:
   Open snippets/index-html-sync-button-replacement.js.
   Replace the existing skyechoSyncBtn onclick function with the provided one.
   Optionally rename the button text from "Sync Session" to "Sync With Discord".

4) In the Discord bot Render service, add:
   SKYECHO_DEFAULT_VOICE_CHANNEL_ID=<your Discord voice channel ID>

5) Redeploy the Discord bot service.

Next step after this patch:
Send src/bot/discordBot.js so the bot can be patched to auto-join when a user enters the synced Discord voice channel.
