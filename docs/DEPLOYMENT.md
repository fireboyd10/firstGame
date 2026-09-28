# Deployment guide

Current state: the app ID is final (`com.fireboydroid.redflagrush`), native icons and
splash screens are generated from the game artwork (`npm run icons:native`), and the
Android release build is signed locally. Solo play is fully offline; only multiplayer
(party mode) needs a hosted server.

## Android: build a signed AAB (no Android Studio needed)

Prerequisites already on this machine: JDK 21 (Android Studio's bundled JBR) and the
Android SDK at `D:\SDK`. The upload keystore lives at
`android/app/upload-keystore.keystore` with credentials in `android/keystore.properties`.
Both are gitignored — **back them up somewhere safe outside OneDrive/git** (a password
manager or encrypted USB). Losing the keystore means you can never update the published app.

```powershell
$env:JAVA_HOME = 'D:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = 'D:\SDK'
cd android
.\gradlew.bat --no-daemon bundleRelease
```

Output: `%LOCALAPPDATA%\red-flag-rush-build\app\outputs\bundle\release\app-release.aab` —
this is the file you upload to Play Console. (Gradle builds outside OneDrive on purpose:
OneDrive locks intermediates mid-sync and breaks builds. Override with
`-PbuildRoot=D:\some\path`.) Bump `versionCode`/`versionName` in
`android/app/build.gradle` before every new upload.

## Monetization (AdMob)

The native apps show ads via `@capacitor-community/admob`; the web/PWA stays ad-free.
Placement policy lives in `src/ads/config.ts`:

- **Interstitial** when leaving a finished game — after every 1–2 completed games
  (varied so it never feels robotic), solo runs and finished party matches counting
  alike. Never mid-game, and the schedule survives app restarts so relaunching can
  never skip or reset it. (AdMob's own server-side frequency capping can add extra
  limits later if you want them — no in-app timer needed.)
- **No banners, no rewarded ads** — one restrained format at one natural breakpoint.

All builds currently use **Google's official test ad units**; `initializeForTesting`
stays on automatically while they are in place. To go live:

1. Create an AdMob account, register the app, and create one interstitial ad unit
   per platform.
2. Set build-time env vars: `VITE_ADMOB_ANDROID_INTERSTITIAL_ID` and
   `VITE_ADMOB_IOS_INTERSTITIAL_ID` (e.g. in a `.env` file — it is gitignored).
3. Replace the test **app IDs** in `android/app/src/main/AndroidManifest.xml`
   (`com.google.android.gms.ads.APPLICATION_ID`) and `ios/App/App/Info.plist`
   (`GADApplicationIdentifier`). For iOS also expand `SKAdNetworkItems` with Google's
   current list for better attribution.
4. Rebuild + resync (`npm run mobile:sync:android`, then `gradlew bundleRelease`).
   Keep testing with test ads on your own devices until release — clicking live ads
   during development gets AdMob accounts banned.

Ads are non-personalized: no App Tracking Transparency prompt, no consent flow.
If you later enable personalized ads in the EU/UK, add a UMP consent flow first and
update PRIVACY.md and the store data-safety forms accordingly.

## Premium topic packs (in-app purchases)

Three non-consumable packs plus a bundle, defined in `src/purchases/products.ts`
(billing via `@capgo/native-purchases` — Play Billing on Android, StoreKit on iOS):

| Product ID | Pack | Fallback price |
| --- | --- | --- |
| `redflagrush.pack.afterdark` | After Dark (spicy) | €1.99 |
| `redflagrush.pack.delulu` | Delulu & Icks | €1.99 |
| `redflagrush.pack.exfiles` | The Ex Files | €1.99 |
| `redflagrush.pack.bundle` | All three packs | €2.99 |

Owned packs join solo runs automatically; party hosts toggle every topic (base and
owned packs) on the create screen and in the lobby. The web build shows packs as
"in the app" — billing only exists in native builds.

To activate (per store — IDs must match exactly):

1. **Google Play**: Play Console → the app → Monetize → Products → In-app products →
   create the four IDs above as **one-time/non-consumable** products with your prices.
   Until products exist, buy attempts fail harmlessly ("Purchase not completed").
2. **Testing for free**: add your Gmail address under Settings → **License testing**,
   and use the internal track — license testers get a fake payment sheet, no charges.
3. **App Store**: App Store Connect → In-App Purchases → same four IDs, type
   **Non-Consumable**. Test with a **Sandbox** Apple ID (free fake purchases).
4. **Restore purchases** is already implemented (store rules require it) — the shop
   and lobby offer it, and entitlements re-sync at every cold start.
5. **Content rating**: the spicy pack likely bumps the game to 17+/Mature in the
   IARC questionnaire. Keep scenarios suggestive, never explicit — explicit sexual
   content is banned on both stores.
6. Declare "In-app purchases" in the Play data-safety form / App Store privacy
   details; purchase records live with the store, not your server.

## Google Play submission (manual, one-time setup)

1. Create a Play Console developer account ($25 one-time, ID verification) at
   https://play.google.com/console.
2. Create the app, choose **Play App Signing** when offered (Google keeps the real
   signing key; your upload key can then be reset if lost).
3. Upload the AAB to an internal/closed track first.
4. Fill in: store listing (title, description, screenshots), content rating
   questionnaire, data-safety form — see PRIVACY.md for what data is handled
   (high scores and settings stay on-device; party play sends names/votes to the
   host's server only).
5. Test on a real phone via the internal track before production rollout.

## iOS: build without a Mac

`.github/workflows/ios-build.yml` compiles the app on a cloud Mac on every push to
`main` (and manually via the Actions tab). Until you enrol in the Apple Developer
Program it builds unsigned, proving the project compiles on real Apple tooling.

After enrolling ($99/year at https://developer.apple.com/programs/):

1. In App Store Connect, create the app with bundle ID `com.fireboydroid.redflagrush`.
2. Add your Distribution certificate (`.p12`) and provisioning profile as repository
   secrets, then extend the workflow with `xcodebuild archive` + `xcodebuild
   -exportArchive` + upload via App Store Connect API key.
   Tools like Fastlane Match or Codemagic make this easier if preferred.
3. Complete the App Store listing, age rating, and privacy questionnaire (same answers
   as Google Play's data-safety form).

## Party server for public multiplayer (optional)

LAN party works with zero setup (`npm run party`). Public internet play needs one
hosted HTTPS server:

```sh
npm run build && npm run build:server
PARTY_PORT=3000 PARTY_ALLOWED_ORIGINS=https://your-domain.com npm run start:party
```

- `PARTY_PORT` — port to listen on (default 3000).
- `PARTY_ALLOWED_ORIGINS` — comma-separated exact frontend origins allowed to call the API.
- `VITE_PARTY_SERVER_URL` — build-time client default so the app points at your server
  without typing it under "Wi-Fi connection".
- Put it behind HTTPS (Caddy/nginx/Cloudflare or a platform like Fly.io/Render).
  Release builds on Android and iOS require HTTPS — plain LAN HTTP only works in debug builds.
- Room state is in memory: run exactly one instance. Scaling beyond that needs a shared
  room store (not implemented).

## Web/PWA hosting (optional)

Deploy `dist/` to any static HTTPS host. The service worker gives offline solo play
and Add-to-Home-Screen install.
