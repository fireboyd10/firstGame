# Deployment guide

Both native projects use `com.fireboydroid.redflagrush` (version 1.0, build 1).
The iOS Swift packages include App, AdMob and Native Purchases. Android targets
API 36 with JDK 21. The included CI workflows compile both platforms without
store signing credentials; their artifacts are **not store-uploadable releases**.

Before submission, run `npm run release:check:android` or
`npm run release:check:ios`. These checks deliberately fail while test ad IDs or
Android signing inputs remain. They cannot verify products, accounts or listings
in the store consoles. Test ads remain appropriate for local device previews.

## Android: build a signed AAB

Install JDK 21 and Android SDK platform 36/build-tools 36.0.0. On this Mac:

```sh
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME="$HOME/Library/Android/sdk"
npm ci
npm run mobile:sync:android
npm run release:check:android
cd android
./gradlew --no-daemon lintRelease bundleRelease
```

Restore the **existing** upload keystore from the Windows machine and its
`android/keystore.properties`; both are ignored by Git. The prior Windows setup
used `android/app/upload-keystore.keystore`. See `android/keystore.properties.example`
for the format. `storeFile` is absolute or relative to `android/app`. Do not generate
a replacement key for an already published app; use the registered upload key or
Google Play's upload-key reset process. Back up signing credentials privately.

Without signing, ordinary release packaging fails with an actionable error.
To verify compilation only, explicitly pass `-PallowUnsignedRelease=true`.
That creates an **unsigned** AAB and does not replace store signing.

Output on macOS/Linux: `android/build/app/outputs/bundle/release/app-release.aab`.
Windows keeps output under `%LOCALAPPDATA%\red-flag-rush-build` to avoid OneDrive
locking intermediates. Use `gradlew.bat` on Windows; `-PbuildRoot=/absolute/path`
overrides the output directory. Increment `versionCode` for every new Play upload.

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

Live ad requests explicitly use `npa: true` and wait for UMP's `canRequestAds`.
The plugin is initialized first because it binds the iOS consent form presenter.
Create and publish the required privacy messages in **AdMob → Privacy & messaging**;
the app refreshes consent on launch, shows required forms, and exposes **Ad privacy
choices** when UMP requires it. A failed consent check leaves ads disabled.
Test units bypass this live-ad consent flow. The app does not request ATT.
Non-personalized ads still require applicable consent and SDK data disclosures;
see [Google's UMP integration](https://developers.google.com/admob/ios/privacy).
Update PRIVACY.md and store privacy forms for the final AdMob/hosting setup.

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
   and lobby offer it, and entitlements are queried silently at every cold start. The explicit restore
   action can ask for store authentication; startup does not invoke it.
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

## iOS: Xcode, device installation and archives

Use Xcode 26+ and Node 22.12+. No CocoaPods installation is required.

```sh
npm ci
npm run mobile:sync:ios
npm run mobile:open:ios
```

In Xcode, select **App**, your connected iPhone, and your team under
**Signing & Capabilities**, then Run. This repository uses the current owner's
team; override `DEVELOPMENT_TEAM` for another account. Automatic signing creates
the development provisioning profile. The iPhone must be trusted, unlocked and
have Developer Mode enabled.

Equivalent CLI build (replace the device UDID with the one Xcode reports):

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination 'id=YOUR_DEVICE_UDID' -derivedDataPath ios/DerivedData \
  -allowProvisioningUpdates build
xcrun devicectl device install app --device YOUR_DEVICE_UDID \
  ios/DerivedData/Build/Products/Debug-iphoneos/App.app
xcrun devicectl device process launch --device YOUR_DEVICE_UDID \
  com.fireboydroid.redflagrush
```

Personal Team signing installs a development preview with a short-lived profile
(normally seven days). Check the embedded profile's actual expiration; rebuild
and reinstall after expiration. This does not enable TestFlight/App Store uploads.

For App Store distribution, enrol in the Apple Developer Program, create the
matching app in App Store Connect, configure the four non-consumable products,
select the paid team in Xcode, and increment the build number for new uploads.
Run `npm run release:check:ios`, sync, then **Product → Archive → Distribute App**.
A command-line archive uses:

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath ios/App/build/RedFlagRush.xcarchive \
  -allowProvisioningUpdates archive
```

An archive signed by a Personal Team is a development artifact. App Store export
requires distribution signing and the paid account. CI's unsigned Release compile
checks source compatibility only. Framework privacy manifests are supplied by
Capacitor/Google's Swift packages; review Xcode's generated privacy report and
complete App Store privacy details for ads, purchases and multiplayer. The app
uses standard platform networking/TLS and declares no non-exempt encryption.

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

## Verified on this Mac (30 September 2026)

- Web typecheck/build, 45 frontend unit tests and 11 server tests pass.
- 22 solo/layout/offline browser checks and six multiplayer browser checks pass.
- Xcode 26.6 compiled, development-signed, installed and launched the app on the
  connected iPhone 15 (iOS 26.6.1); the WebView and native plugins loaded.
  The installed development profile expires on 7 October 2026 at 14:56:59 UTC.
- A signed Release archive was created at
  `ios/App/build/RedFlagRush.xcarchive` using the development certificate;
  App Store distribution signing is still required.
- Android `lintRelease bundleRelease -PallowUnsignedRelease=true` compiles the
  Release AAB with zero app lint errors (20 existing warnings, mostly template
  resources/icons). The bundle contains no native `.so` libraries.
- Production store readiness is pending: restore the Android upload key, supply
  production AdMob app/unit IDs and publish UMP messages, configure/verify store
  products and listings, select paid Apple distribution signing, and complete
  real-device purchase/ad/multiplayer acceptance tests. A production HTTPS party
  endpoint is needed for public multiplayer; users can enter their own endpoint.
