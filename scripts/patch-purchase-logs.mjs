import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Native Purchases 8.8.1 logs raw transaction objects, tokens and order IDs.
// Redact only these diagnostic statements; billing calls and return values stay intact.
const root = resolve(import.meta.dirname, '..', 'node_modules/@capgo/native-purchases');
const version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
if (version !== '8.8.1') throw new Error(`Review the purchase-log redaction for Native Purchases ${version}.`);
const path = resolve(root, 'android/src/main/java/ee/forgr/nativepurchases/NativePurchasesPlugin.java');
const source = readFileSync(path, 'utf8');
const sensitive = /purchaseToken|purchase\.getPurchaseToken\(|purchase\.getOrderId\(|purchase\.toString\(|"handlePurchase"\s*\+\s*purchase/;
const patched = source.split('\n').map(line => {
  if (!/\bLog\.[a-z]+\(/.test(line) || !sensitive.test(line)) return line;
  const match = /^(\s*)Log\.([a-z]+)\([^,]+,.*\);\s*$/.exec(line);
  if (!match) throw new Error('Unexpected billing log format; transaction redaction was not applied.');
  return `${match[1]}Log.${match[2]}(TAG, "Billing event (transaction data omitted)");`;
}).join('\n');
if (patched !== source) writeFileSync(path, patched);
const swiftPath = resolve(root, 'ios/Sources/NativePurchasesPlugin/NativePurchasesPlugin.swift');
const swiftSource = readFileSync(swiftPath, 'utf8');
const swiftPatched = swiftSource
  .replace(/print\("purchaseProduct result .*?\)"\)/g, 'print("purchaseProduct completed (transaction data omitted)")')
  .replace(/print\("Manually finishing transaction: .*?\)"\)/g, 'print("Manually finishing transaction (transaction data omitted)")');
if (swiftPatched !== swiftSource) writeFileSync(swiftPath, swiftPatched);
console.log('Native Purchases transaction credentials are omitted from diagnostic logs.');
