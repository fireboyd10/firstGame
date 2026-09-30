// Checks local release inputs; store accounts, products, listings and review are external.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';

const platform = process.argv[2];
if (!['android', 'ios'].includes(platform)) {
  console.error('Usage: node scripts/check-release.mjs <android|ios>');
  process.exit(1);
}
const root = resolve(import.meta.dirname, '..');
const env = { ...loadEnv('production', root, 'VITE_'), ...process.env };
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
const publisher = 'ca-app-pub-3940256099942544';
const unit = env[`VITE_ADMOB_${platform.toUpperCase()}_INTERSTITIAL_ID`] ?? '';
check(/^ca-app-pub-\d{16}\/\d{10}$/.test(unit) && !unit.startsWith(publisher),
  `Set VITE_ADMOB_${platform.toUpperCase()}_INTERSTITIAL_ID to your production ad unit.`);
const nativePath = platform === 'android' ? 'android/app/src/main/AndroidManifest.xml' : 'ios/App/App/Info.plist';
const nativeConfig = readFileSync(resolve(root, nativePath), 'utf8');
const appId = platform === 'android'
  ? nativeConfig.match(/android:name="com\.google\.android\.gms\.ads\.APPLICATION_ID"\s+android:value="([^"]+)"/)?.[1]
  : nativeConfig.match(/<key>GADApplicationIdentifier<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
check(/^ca-app-pub-\d{16}~\d{10}$/.test(appId ?? '') && !appId?.startsWith(publisher),
  `Replace the test AdMob app ID in ${nativePath}.`);
if (platform === 'android') {
  check(existsSync(resolve(root, 'android/keystore.properties')),
    'Restore android/keystore.properties and its existing upload keystore; Gradle validates the credentials when signing.');
}
// A blank endpoint supports manually entered HTTPS servers. A configured default must be secure.
if (env.VITE_PARTY_SERVER_URL) {
  try { check(new URL(env.VITE_PARTY_SERVER_URL).protocol === 'https:', 'The production party server must use HTTPS.'); }
  catch { failures.push('VITE_PARTY_SERVER_URL must be a valid HTTPS URL.'); }
}
if (failures.length) {
  console.error(`Release inputs incomplete (${platform}):\n${failures.map((message) => `- ${message}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`${platform}: local release inputs are present. Verify store products, consent messages, signing, privacy disclosures and device testing in docs/DEPLOYMENT.md before submission.`);
}
