# RED FLAG RUSH

**Red flag, but I like it.** A party game about dating, questionable taste, and the arguments your friends will absolutely have about both. Solo play turns ten choices into a personal verdict and works offline.

## Play together on Wi-Fi

In the installed Android/iOS app, connect everyone's phones to the same Wi-Fi.
Choose **Play with friends**, enter your name, and **Create a room**. That phone
hosts the room automatically. Friends enter their names and the six-character
code and tap **Join**; the app finds the hosting phone on Wi-Fi. No computer or
internet-hosted service is needed. Keep the hosting phone in the game until the
party ends, and allow local-network access if the system asks. Guest networks
that isolate devices cannot support local parties. **Connection help** provides
a host-address fallback when the network blocks automatic discovery.

### Browser development and Wi-Fi play

On the computer, from this project folder:

```powershell
npm.cmd ci
npm.cmd run party
```

`npm.cmd run party` builds the web game and party deck, then runs both the website and room API on port 3000. Keep that terminal open.

1. Connect the computer and all phones to the same Wi-Fi.
2. Open the **Same Wi-Fi** address printed in the terminal on every device, including the host. It looks like `http://192.168.1.203:3000/`, but your address can change.
3. Choose **Play with friends**. The host enters a name, chooses 5, 10, or 15 scenarios, and creates a room.
4. Everyone else enters a name and the six-character room code at the same website address.
5. The host starts once everyone has joined. Two to eight people can play.

On phones, `localhost` means the phone itself. Use the computer's Wi-Fi address. If Windows Firewall prompts, allow Node on the **private network**. No router port forwarding is needed. Guest Wi-Fi, VPNs, or router client isolation can prevent devices from seeing one another.

### Party rules

Everyone sees the same scenario. Voting starts with a 30-second timer, but **results appear immediately when everyone has voted**. Votes stay private until then. If somebody needs longer than 30 seconds, voting stays open until they answer. The results show the group split and who picked each flag, plus a question to get the conversation going. Only the host can start the next scenario.

Final results show:

- **Taste for Chaos:** red-flag scenarios voted green divided by all red-flag scenarios shown.
- **Green flag appreciation:** green-flag scenarios voted green divided by all green-flag scenarios shown.
- A personal title, a funny line, and a ranking by red-flag tolerance. Ties share their rank without speed or healthy-behaviour tiebreakers.

Every deck contains both types. The classifications are editorial takes used for final scores, not revealed as right/wrong feedback between rounds. Party content is in `src/data/party-scenarios.ts`, separate from the solo deck. Room themes change the crowd label, not scoring or assumptions about gender.

Reloading the same browser tab restores your seat. A disconnected player can return and finish voting. After a minute without contact, the host can explicitly remove that player; the room never invents a vote. Round moderation transfers if the moderator leaves or stops responding. In the native app, the phone that created the room must keep hosting even if another player becomes moderator. Rooms are held in memory, expire after two hours without activity, and disappear when the hosting app/server stops. Reloading the hosting phone's WebView starts over because its in-memory room is lost.

### If a native room will not connect

- Keep the phone that created the room in the game and connect all phones to the same Wi-Fi.
- Allow Local Network access on iOS. Check the six-character room code.
- Under Wi-Fi connection, the guest can enter the connection address displayed by the host if discovery is blocked.
- Guest Wi-Fi with client isolation cannot support local parties. Use a trusted network that allows devices to communicate.

### If a browser room will not connect

- Stop any old terminal running this project and run `npm.cmd run party` again. Reload the game. On an installed PWA, accept **Update & reload** if offered.
- Open the same printed address **and port** on every phone. A room on port 3000 is separate from a room on port 5173.
- Check `http://YOUR-COMPUTER-IP:3000/api/health`. It should show `red-flag-party` and version `2`. If it will not load on a phone, check the Wi-Fi connection and firewall.
- A static file host alone cannot create rooms. Use the included server, or set the address under **Wi-Fi connection** to a running party server.

## Development

Web commands support Node 20.19 or Node 22.12 and newer. Node 24 LTS is recommended for native tooling. On macOS/Linux, use `npm` in place of `npm.cmd`.

```powershell
npm.cmd run dev
```

Vite runs on port 5173 and includes the room API. Its **Network** URL works for multiplayer too. Restart the dev server after server-code changes. Vite preview also includes a room API:

```powershell
npm.cmd run build
npm.cmd run preview
```

Use one server process and one address for the whole party. Development and preview rooms are independent and do not survive restarting their server.

## Solo controls and offline play

| Action | Touch / mouse | Keyboard |
| --- | --- | --- |
| Red / green | Swipe left / right or flag buttons | Left / Right Arrow |
| Start / replay | Main button | Enter or Space |
| Pause / resume | Pause / Back to it | Escape |
| Restart | Restart button or pause menu | Tab, then Enter |

Solo presents ten scenarios and reports your Taste for Chaos and Green Flag Appreciation. The 30-second countdown never forces an answer or changes your verdict. Sound is synthesized locally; settings remain on the device. Switching apps pauses solo play until you resume. Neutral illustrations do not indicate the answer.

For offline solo play, deploy `dist/` to static HTTPS hosting and install from the browser's Add to Home Screen menu. The service worker caches only build assets. Updates wait until you choose to reload; room API responses are never cached. Ordinary LAN HTTP is enough for browser party play, but does not enable PWA installation/offline caching on phones. Browser multiplayer needs a running, reachable party server; installed apps host rooms directly on the first phone.

## Native builds and release preparation

Android and iOS Capacitor projects are included. See [docs/MOBILE.md](docs/MOBILE.md) for toolchains, syncing, and LAN testing, and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for Android AAB signing, Xcode device installation, iOS archives, and the remaining store setup. Both platforms have CI compile checks. Run `npm run release:check:android` or `npm run release:check:ios` to identify missing local release inputs. The app ID is final (`com.fireboydroid.redflagrush`); test ads and a development-signed iPhone app are not store releases.

For an internet-hosted party, build the web game and server deck, then run `npm run start:party` behind HTTPS. `PARTY_PORT` defaults to 3000. Set `PARTY_ALLOWED_ORIGINS` to a comma-separated list of exact frontend origins if using a different domain or reverse proxy. `VITE_PARTY_SERVER_URL` can set the client default at build time. Use one server instance; room state is in memory. Public scaling/persistence would need a shared room store. Do not expose the development server publicly.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run build:server
npm.cmd run test:party
```

The party browser check uses three isolated browser sessions and a real HTTP server to verify immediate reveals after the final vote. An injected server clock also checks extra time for a late voter. Server unit tests verify vote privacy and host-controlled progression. It uses installed Edge/Chrome or Playwright Chromium (`npx playwright-core install chromium`).

For the solo/layout/offline browser checks, leave preview running and run `npm.cmd run test:browser` in another terminal. Override `BASE_URL` if preview uses a different port. Reports and screenshots go into ignored `.qa/`.

Physical Android/iPhone, Safari/WebKit, native sharing, and signed-store builds still require device testing. See [PRIVACY.md](PRIVACY.md) for data handling.
