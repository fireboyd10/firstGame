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

The installed apps host party rooms on the phone that creates the room. Native
Bonjour/NSD finds rooms on the same Wi-Fi and a bounded TCP bridge carries the
existing room API messages. The same `server/rooms.mjs` engine supplies all room
rules on both the phone and the development server. No computer or cloud service
is needed for native parties. Keep the hosting app open; closing it ends rooms
stored in its memory. Android binds client sockets to Wi-Fi, including networks
without internet, and iOS asks for local-network access. A host-address fallback
is available when automatic discovery is blocked. Wi-Fi client isolation still
prevents devices from communicating.

The shell loads bundled `dist/` assets. Do not set a release `server.url` to a development address. Solo play pauses on native background events as well as browser visibility changes. Android Back closes party/help, pauses solo, or returns home; at home it minimizes the app. Native apps skip service-worker registration and receive bundled updates through native releases.

Native party requests use the phone's Wi-Fi connection, with bounded message sizes and request timeouts. The browser version uses ordinary fetch against the development/server API. `VITE_PARTY_SERVER_URL` applies to browser hosting, not native room discovery.

## Test local multiplayer

Install the app on two or more phones connected to the same Wi-Fi. On the first phone, open Party, enter a nickname and create a room. On the other phones, open Party, enter a nickname and the room code, and join. Keep the phone that created the room in the game throughout the party. Changing the round moderator does not move the network host to another phone.

The native LAN bridge also works in signed Android release builds. It does not use WebView HTTP or require a computer endpoint. Android's existing cleartext HTTP policy remains unchanged. The room protocol is local TCP; use it on a trusted Wi-Fi network. Room codes and player tokens are not a confidential messaging service.

iOS declares the Bonjour service and a local-network usage description. Allow Local Network access when prompted; if denied, enable it in Settings before trying again. See [Apple local network privacy](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy). Its existing ATS settings remain unchanged.

For native Android automation, install a debug APK on two devices on the same Wi-Fi and run `node scripts/phone-party-android-check.mjs`. Set `ADB` to the adb executable and `PARTY_ANDROID_DEVICES` to their comma-separated serial numbers. Android Emulator 36.5 or newer supports a shared Wi-Fi network between instances. The check uses the actual installed apps and native plugins, not a computer room server. Continue with physical Android/iPhone and mixed-platform testing before public release.

For browser development only, `npm.cmd run party` starts the existing computer server. Open its printed Wi-Fi address in each phone's browser.

## Before store submission

- The permanent identifier `com.fireboydroid.redflagrush` is set consistently in Capacitor config and both native projects. Set release versions and signing.
- Native launcher icons and splash screens are generated from the game artwork (`npm run icons:native`). Swap in final branding later if the artwork changes.
- Native parties need a Wi-Fi network that allows communication between devices; no production party endpoint is required. Browser hosting still needs an endpoint, exact allowed frontend origins, and HTTPS.
- Run the unit, server, and browser checks, then test actual Android and iOS devices: solo pause/resume, native Back, Wi-Fi joining, local-network permission denial, app switching during a vote, reconnecting, safe areas, large text, and a complete multiplayer game.
- Review the privacy notice and store data disclosures for your final hosting setup. Keep signing keys outside version control.

App-store distribution still requires production AdMob configuration, store products, account setup, store signing, and full device acceptance testing. The native projects and CI workflows provide reproducible builds; a successful compile is not store approval.
