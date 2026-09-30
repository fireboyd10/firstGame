# Android and iOS preparation

Capacitor 8.5.2, the App lifecycle plugin, an Android project, and an iOS Swift Package Manager project are included. The web game remains playable through its existing commands. The iOS project has been built with Xcode on macOS for a physical iPhone 15. See docs/DEPLOYMENT.md for signed device builds, Android signing inputs, and the remaining store setup.

## Toolchains

Native commands require Node 22.12+; Node 24 LTS is recommended. Capacitor 8 requires Android Studio 2025.2.1+ for Android and macOS with Xcode 26+ for iOS. Install the SDK and JDK versions required by the generated Gradle project. See the [official environment setup](https://capacitorjs.com/docs/getting-started/environment-setup).

```powershell
npm.cmd ci
npm.cmd run mobile:sync:android
npm.cmd run mobile:open:android
```

On macOS:

```sh
npm ci
npm run mobile:sync:ios
npm run mobile:open:ios
```

Sync scripts build and typecheck the web app before copying it. `mobile:sync` targets Android on Windows and both projects on macOS. Do not add the platforms again; the scaffolds already exist. The iOS project resolves native packages through SPM.

## App behaviour

The shell loads bundled `dist/` assets. Do not set a release `server.url` to a development address. Solo play pauses on native background events as well as browser visibility changes. Android Back closes party/help, pauses solo, or returns home; at home it minimizes the app. Native apps skip service-worker registration and receive bundled updates through native releases.

Party mode calls Capacitor's native HTTP API on native platforms, with explicit request timeouts, and uses ordinary fetch on the web. See [Capacitor HTTP](https://capacitorjs.com/docs/apis/http). The party server address can be entered under Wi-Fi connection or configured with `VITE_PARTY_SERVER_URL` before building.

## Test local multiplayer

Run `npm.cmd run party` on a computer and enter its Wi-Fi address in the native app. Keep the computer awake and on the same network. Opening that address in each phone's browser is also supported and requires no app installation.

Android debug builds allow LAN HTTP via the debug manifest. Release builds require HTTPS; the debug override is not packaged into a release. See [Android network configuration](https://developer.android.com/privacy-and-security/security-config). A released app therefore needs an HTTPS party endpoint, or a separately reviewed local-network transport policy.

iOS declares a local-network usage description and a local-network ATS exception. Allow Local Network access when prompted. Validate the chosen hostname/IP and transport on the actual supported iOS versions; HTTPS is the release default. See [Apple local network privacy](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy) and [NSAllowsLocalNetworking](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking). No broad arbitrary-load exception is enabled.

## Before store submission

- The permanent identifier `com.fireboydroid.redflagrush` is set consistently in Capacitor config and both native projects. Set release versions and signing.
- Native launcher icons and splash screens are generated from the game artwork (`npm run icons:native`). Swap in final branding later if the artwork changes.
- Set the production party endpoint, exact allowed frontend origins, and HTTPS. Solo can remain entirely offline; the native app does not host rooms itself.
- Run the unit, server, and browser checks, then test actual Android and iOS devices: solo pause/resume, native Back, Wi-Fi joining, local-network permission denial, app switching during a vote, reconnecting, safe areas, large text, and a complete multiplayer game.
- Review the privacy notice and store data disclosures for your final hosting setup. Keep signing keys outside version control.

App-store distribution still requires production AdMob configuration, store products, account setup, store signing, and full device acceptance testing. The native projects and CI workflows provide reproducible builds; a successful compile is not store approval.
