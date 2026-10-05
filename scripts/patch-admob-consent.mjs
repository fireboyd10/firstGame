import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// AdMob 8.1.0 binds the iOS UMP presenter only during MobileAds initialization.
// Bind it when UMP is called instead, so consent can be gathered before starting ads.
const root = resolve(import.meta.dirname, '..');
const packageRoot = resolve(root, 'node_modules/@capacitor-community/admob');
const version = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')).version;
if (version !== '8.1.0') throw new Error(`Review the UMP presenter patch for AdMob ${version} before building.`);
const path = resolve(packageRoot, 'ios/Sources/AdMobPlugin/AdMobPlugin.swift');
const source = readFileSync(path, 'utf8');
const start = '    @objc func requestConsentInfo(_ call: CAPPluginCall) {';
const patched = start + '\n        self.consentExecutor.plugin = self // Allow UMP before MobileAds.start.\n';
if (!source.includes(patched)) {
  if (source.split(start).length !== 2) throw new Error('Unexpected iOS AdMob source; UMP patch was not applied.');
  writeFileSync(path, source.replace(start, patched));
}
console.log('AdMob iOS UMP presenter is available before ad SDK initialization.');
