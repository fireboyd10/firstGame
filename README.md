# RED FLAG RUSH

**Swipe the Signs.** A portrait-first social intuition game: read an original scenario, flag the behavior red or green, and keep your streak alive. Three lives, 60 cards, a timer that ramps from 5 to 2.8 seconds, and a complete replay/share loop.

Built with Vite, vanilla TypeScript, semantic HTML, CSS, and original SVG art. No runtime dependencies, accounts, backend, analytics, remote assets, or API keys. Sound is synthesized on your device. Entertainment and reflection only — not clinical advice.

## Start in VS Code

Install a supported [Node.js LTS](https://nodejs.org/) with npm, then restart VS Code. Supported versions: Node 20.19+, 22.12+, or newer supported LTS; verified with Node 24.21.0. Git is optional for playing.

Open this folder, choose **Terminal → New Terminal**, and run:

```powershell
npm.cmd ci
npm.cmd run dev -- --host 0.0.0.0
```

Open **http://localhost:5173/**. Keep the terminal open; Ctrl+C stops the server. Dependencies are already installed in the original delivery workspace. On macOS/Linux, use `npm` in place of `npm.cmd`. Windows users can also use `npm` if their PowerShell execution policy permits it; `npm.cmd` avoids changing that policy.

`npm ci` installs the exact versions in the included lockfile. There are four development dependencies: Vite, TypeScript, Vitest, and playwright-core. No global npm packages are needed. `npm install` is also available when intentionally changing dependencies.

## Play on your phone

1. Connect the computer and phone to the **same Wi-Fi**.
2. Start `npm.cmd run dev -- --host 0.0.0.0` and keep its terminal open.
3. Open the **Network** URL printed by Vite on your phone. This computer's Wi-Fi IPv4 was **192.168.1.242**, so its tested LAN address is **http://192.168.1.242:5173/**. It can change: use `ipconfig` and find the Wi-Fi IPv4 address.
4. If Windows Firewall asks, allow access on **private networks only**.
5. Do not forward the port or expose the development server to the public internet.

LAN HTTP is for gameplay testing. It normally **cannot install/cache the PWA** because phones require HTTPS for service workers. Desktop `localhost` is a secure-context exception, which makes it useful for offline development testing.

## Controls

| Action | Touch / mouse | Keyboard |
| --- | --- | --- |
| Red flag | Swipe left or red button | Left Arrow |
| Green flag | Swipe right or green button | Right Arrow |
| Start / replay | Main button | Enter or Space on the button; also from the page |
| Pause / resume | Pause / Back to it | Escape |
| Restart | Circular-arrow button or pause menu | Tab to Restart, Enter |

Wrong answers and timeouts cost one life. Correct answers earn 100 points plus up to 50 for speed; streaks of 5, 10, and 15 unlock ×2, ×3, and ×4. Explanations remain visible for 2.2 seconds; pausing also holds the explanation. Switching apps pauses a run until you explicitly resume. Sound and vibration are optional. High score, tutorial state, mute, and vibration preferences stay in localStorage; if storage is blocked, the current session still works.

## Production and offline play

```powershell
npm.cmd run build
npm.cmd run preview -- --host 0.0.0.0
```

Open **http://localhost:4173/** on the computer. For LAN gameplay with the production build, use **http://192.168.1.242:4173/** (or your current IPv4).

Deploy the **contents of `dist/`** to a normal static HTTPS host. Nothing has been deployed automatically. Optional choices include GitHub Pages, Cloudflare Pages, and Netlify; see [Vite's static-hosting instructions](https://vite.dev/guide/static-deploy.html). Build command: `npm run build`; output folder: `dist`. The preview server is for local verification, not public hosting.

`base: './'` in `vite.config.ts` supports a domain root or a subfolder without rebuilding. Serve the folder URL with a trailing slash, for example `/firstGame/`. The game has no required server-side routes. Refreshing its root URL works on static hosts; the installed worker also handles offline nested navigation. A first-ever visit to an arbitrary nested path needs a host fallback to the app's `index.html` and an absolute Vite `base` matching the hosting folder.

Builds generate an explicit worker with a content-derived cache version and a list of only local assets. All shell assets must download successfully before installation completes. Updates wait; an **Update & reload** button appears on the start/results screen, never during a run. An old tab keeps its cached assets when another tab accepts an update. HTML and hashed assets stay on one release. Browser storage eviction can remove the offline copy, requiring another online visit.

To install the HTTPS version after loading it online and seeing **Ready for your next offline run**:

- **Android:** Chrome/Edge/Samsung Internet menu → **Install app / Add to Home screen**.
- **iPhone Safari:** Share → **Add to Home Screen**.

Then launch once, switch to airplane mode, and reopen it. Installation UI varies by browser. Without service-worker support, online gameplay still works. The worker is intentionally disabled in the Vite development server.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

For reproducible browser checks, keep a production preview running in one terminal, then in a second terminal run:

```powershell
npm.cmd run test:browser
```

The script uses your existing Edge or Chrome; it downloads no browser. Optional environment variables: `BROWSER_CHANNEL=chrome` or `BASE_URL=http://127.0.0.1:4173/`. Reports and screenshots go into ignored `.qa/`.

Verified on Windows / Node 24.21.0 / Edge 153:

- Clean lockfile installation passed (`npm.cmd ci --offline --cache .npm-cache --no-audit --no-fund`, using the previously downloaded packages).
- Type checking, **21 unit tests**, and the production build passed.
- **22 browser check groups** passed: tutorial, full run, both buttons, real pointer drag/snap-back, keyboard, score/lives/multiplier, duplicate-input protection, timer, pause/visibility, game over, replay/restart, sharing fallbacks, and persistence.
- No horizontal overflow at **320×568, 360×800, 390×844, 412×915, 1440×1000, and 844×390**. Every scenario and explanation was checked at 320×568.
- Manifest, actual PNG dimensions, production worker, offline reload/deep navigation, subfolder hosting, and unavailable storage/audio/haptics/service-worker fallbacks passed. No uncaught browser errors, missing assets, or external runtime requests were observed.

Offline automation used the **localhost secure-context exception**, not a deployed HTTPS site. Physical Android/iPhone, Safari/WebKit, native sharing, installation prompts, and actual device vibration still need the phone checks below.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Node not found / too old | Install current Node LTS with npm and Add to PATH selected, fully restart VS Code, then run `node --version` and `npm.cmd --version`. |
| Old npm crashes with `edgesOut` | Use `npm.cmd ci` with the supplied lockfile. If still blocked, invoke bundled npm directly: `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" ci`. An older global npm can shadow the bundled version. |
| Corporate certificate error | With Node 24 and an approved certificate already in the Windows trust store, set `$env:NODE_USE_SYSTEM_CA = '1'` in this terminal, then retry. Do not disable certificate verification. |
| `EPERM` on `esbuild.exe` during installation | Stop this project's dev/preview server with Ctrl+C, then rerun `npm.cmd ci`; Windows may lock the running executable. |
| Port already in use | Stop the earlier server, or use `npm.cmd run dev -- --host 0.0.0.0 --port 5174` and open the new port. |
| Phone cannot reach computer | Confirm the current IPv4, same Wi-Fi, running terminal, and `--host 0.0.0.0`. A phone cannot reach your computer using `localhost`. |
| Firewall / Wi-Fi trouble | Allow Node on Windows private networks. Guest networks, AP isolation, VPNs, or mobile data can separate the devices; use the same trusted Wi-Fi. |
| Old service-worker content | Accept Update & reload, or close all app tabs and reopen online. Last resort: DevTools → Application → Service Workers → Unregister. Clearing all site storage also removes scores/preferences. |
| Install option / offline missing | Use a production build on HTTPS. Plain phone LAN HTTP and Vite dev intentionally lack full PWA behavior. |

## Optional Android APK / Play Store path

The web game needs none of the Android toolchain. When ready, add Capacitor in a separate change following its [installation guide](https://capacitorjs.com/docs/getting-started) and [Android setup](https://capacitorjs.com/docs/android):

```powershell
npm.cmd install @capacitor/core @capacitor/android
npm.cmd install --save-dev @capacitor/cli
npx.cmd cap init
```

Choose your final app name and unique package ID; set `webDir: 'dist'` in Capacitor's config. Then:

```powershell
npm.cmd run build
npx.cmd cap add android
npx.cmd cap sync android
npx.cmd cap open android
```

Install the Android Studio/SDK/JDK versions required by the Capacitor version you choose. Test on a device or emulator, then use Android Studio for a debug APK or a signed release APK/AAB. A Google Play release also needs your signing key, developer account, store listing, and current store-policy steps. None of Capacitor, Android Studio, SDK, emulator, JDK, or Gradle has been installed by this project.

## Project map and launch checklist

`src/game/` owns testable state, timing, scoring, decks, and storage; `src/data/scenarios.ts` owns the cards. `src/main.ts` connects the UI, `src/swipe.ts` handles Pointer Events, and `src/audio/` synthesizes sound. PWA assets live in `public/`; `scripts/build-sw.mjs` versions the production cache. Icons are committed PNGs generated without packages by `npm.cmd run icons` from original code-native art.

- [ ] On Android and iPhone, finish a run with swipes and buttons; verify pause after switching apps.
- [ ] Try muted play, restart, replay, sharing, portrait/landscape, and reduced-motion settings.
- [ ] On the eventual HTTPS site, install to the home screen and complete an airplane-mode run.
- [ ] Test one deployed update and check that a live run is not interrupted.
- [ ] Review [PRIVACY.md](PRIVACY.md), store copy, and signing before public release.
