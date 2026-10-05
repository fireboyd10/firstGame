# Red Flag Rush privacy policy

Last updated: 5 October 2026.

Red Flag Rush is provided by DA Game Studios (fireboyd10). For privacy questions or requests, contact [anc.darius@gmail.com](mailto:anc.darius@gmail.com).

RED FLAG RUSH has no game accounts or separate analytics service. The web/PWA has no ads or billing. Native Android and iOS builds include Google AdMob and store billing through Google Play or Apple StoreKit.

Native builds can show interstitial ads between completed games. Device previews use Google's test ad units. Before requesting live ads, the app updates Google's User Messaging Platform (UMP) consent status and presents any required consent form. If UMP cannot authorize ad requests, gameplay continues without ads. Where required, **Ad privacy choices** in the footer lets you reopen the privacy form. Ad requests explicitly request non-personalized ads; the app does not request Apple's tracking authorization. Non-personalized ads still involve data processing: Google's SDK can process IP addresses, device information, diagnostics, and ad interactions. See [Google's advertising privacy information](https://policies.google.com/technologies/ads). Store privacy disclosures must include the SDK's applicable data practices.

Premium topic packs are non-consumable purchases handled by the platform's store. Payment details stay with Apple or Google. The app queries product prices and purchase entitlements and caches unlocked packs on-device. **Restore purchases** asks the store to restore ownership. An ad-frequency counter is also stored on-device.

Solo scores, tutorial state, and sound/vibration preferences stay in localStorage on your device. An optional service worker caches static game files for offline solo play. Clearing browser storage or uninstalling can remove these records.

When you create or join a party in the native app, the phone that creates the room hosts it on the local Wi-Fi network. Nearby room discovery uses Bonjour/network service discovery. Your chosen nickname, room code, votes, and calculated results are exchanged with that phone. Room state stays in memory, with no database or vote log. Inactive rooms expire after two hours; closing the hosting app clears its rooms. Connection rate limits temporarily use connecting network addresses. The browser version can also connect to a separately operated party server; its hosting provider or reverse proxy may retain access logs.

Votes stay private from other players during voting. As soon as every player has voted, room members see each other's choices. At the end, everyone in the room sees the personal percentages and ranking. The hosting device or server operator can access the room's memory; room codes are invitations for a friends' game, not a confidential service.

A random player token, nickname, room code, and server address are saved in your tab's sessionStorage so reloading can restore your seat. Leaving a room removes this saved session. Closing the tab clears it according to the browser's session-restoration behaviour. The app makes no party-server requests until you open party mode and join or resume a room.

Native mobile builds may ask for local-network access when joining a Wi-Fi party. No location, contacts, camera, or microphone access is required.

Sharing a solo score happens only when you press Share. Nothing is posted automatically. Party percentages are a game-night joke based on the deck's editorial classifications, not a personality assessment.

To remove data saved by the game, clear its app/browser storage or uninstall it. Leave a party to remove its saved session; room data expires as described above. Google and the stores retain SDK or transaction data according to their own policies. Email the contact above for privacy questions; avoid sending payment details or sensitive information.

The policy is bundled in the app for offline access and published at [https://fireboyd10.github.io/redflagrush/privacy.html](https://fireboyd10.github.io/redflagrush/privacy.html). Changes to data practices will be reflected here and in the applicable store disclosures.
