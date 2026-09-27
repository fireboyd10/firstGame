# Privacy

RED FLAG RUSH has no accounts, advertising, analytics, or tracking SDKs.

Solo scores, tutorial state, and sound/vibration preferences stay in localStorage on your device. An optional service worker caches static game files for offline solo play. Clearing browser storage or uninstalling can remove these records.

When you create or join a party, your chosen nickname, room code, votes, and calculated results are sent to the party server you connect to. The server keeps rooms in memory, with no database or vote log. Inactive rooms expire after two hours; stopping the server clears all rooms. Server HTTP rate limits temporarily use connecting IP addresses. A hosting provider or reverse proxy may retain its own access logs.

Votes stay private from other players during voting. As soon as every player has voted, room members see each other's choices. At the end, everyone in the room sees the personal percentages and ranking. The server operator can access the server's memory; room codes are invitations for a friends' game, not a confidential service.

A random player token, nickname, room code, and server address are saved in your tab's sessionStorage so reloading can restore your seat. Leaving a room removes this saved session. Closing the tab clears it according to the browser's session-restoration behaviour. The app makes no party-server requests until you open party mode and join or resume a room.

Native mobile builds may ask for local-network access when joining a Wi-Fi party. No location, contacts, camera, or microphone access is required.

Sharing a solo score happens only when you press Share. Nothing is posted automatically. Party percentages are a game-night joke based on the deck's editorial classifications, not a personality assessment.
