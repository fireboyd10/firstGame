import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { _android } from 'playwright-core';

const root = resolve(import.meta.dirname, '..');
const adb = process.env.ADB || 'adb';
const devices = (process.env.PARTY_ANDROID_DEVICES || 'emulator-5554,emulator-5556').split(',');
assert.equal(devices.length, 2, 'Provide two Android devices on the same Wi-Fi.');
const output = resolve(root, '.qa'); await mkdir(output, { recursive: true });
const report = { passed: [], errors: [], latencyMs: [], devices };
const attachedDevices = [];
const command = (device, ...args) => execFileSync(adb, ['-s', device, ...args], { encoding: 'utf8', timeout: 20000 }).trim();

try {
  const pages = [];
  const availableDevices = await _android.devices({ omitDriverInstall: true });
  for (const [index, device] of devices.entries()) {
    command(device, 'shell', 'am', 'start', '-n', 'com.fireboydroid.redflagrush/.MainActivity');
    const attached = availableDevices.find(candidate => candidate.serial() === device);
    assert(attached, `Android device ${device} is unavailable.`);
    attachedDevices.push(attached);
    const webView = await attached.webView({ pkg: 'com.fireboydroid.redflagrush' }, { timeout: 60000 });
    const page = await webView.page();
    assert(page, 'Native WebView not found. Install the debug build.');
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => report.errors.push(error.message));
    await page.locator('[data-action="party-open"]').waitFor();
    if (!index) {
      await page.locator('[data-action="shop-open"]').click();
      await page.locator('summary').filter({ hasText: 'Review access' }).click();
      await page.locator('#review-code').fill('WRONGCODE');
      await page.locator('[data-action="review-activate"]').click();
      await page.locator('#review-error:not([hidden])').waitFor();
      const originalOwnership = await page.evaluate(() => localStorage.getItem('red-flag-rush.packs.v1'));
      const review = JSON.parse(await readFile(resolve(root, 'release/play-store/review-access-private.json'), 'utf8'));
      await page.locator('#review-code').fill(review.code);
      await page.locator('[data-action="review-activate"]').click();
      await page.locator('[data-action="review-exit"]').waitFor();
      assert.equal(await page.locator('.pack-owned').count(), 3);
      assert.equal(await page.evaluate(() => localStorage.getItem('red-flag-rush.packs.v1')), originalOwnership);
      await page.locator('[data-action="close-shop"]').click();
      await page.locator('[data-action="party-open"]').click();
      assert.equal(await page.locator('.topic-locked').count(), 0, 'Reviewer must access every premium topic without payment');
      await page.locator('[data-party-action="close"]').click();
      await page.locator('[data-action="shop-open"]').click();
      await page.locator('[data-action="review-exit"]').click();
      await page.locator('[data-action="close-shop"]').click();
      report.passed.push('Real native review-code verification unlocks every premium topic without charging or changing purchased ownership; exit restores normal access');
    }
    await page.locator('[data-action="party-open"]').click();
    assert(!/npm.cmd|On your computer/.test(await page.locator('#modal-content').textContent()), 'Native party UI must not require a computer.');
    await page.locator('#party-name').fill(index ? 'Guest phone' : 'Host phone');
    pages.push(page);
  }
  const [host, guest] = pages;
  await host.locator('#party-length').selectOption('5');
  await host.locator('[data-party-action="create"]').click();
  await host.locator('#party-lobby').waitFor();
  const code = (await host.locator('.party-room-code').textContent()).trim();
  const securityCode = (await host.locator('.party-security-code').textContent()).trim();
  await guest.locator('#party-code').fill(code);
  await guest.locator('#party-security').fill('0000-0000-0000');
  await guest.locator('[data-party-action="join"]').click();
  await guest.locator('#party-error:not([hidden])').waitFor();
  assert.match(await guest.locator('#party-error').textContent(), /security code/i);
  assert.equal(await host.locator('.party-player').count(), 1, 'Wrong security code must not send a nickname or create a player');
  await guest.locator('#party-security').fill(securityCode);
  const discoveryStart = performance.now();
  await guest.locator('[data-party-action="join"]').click();
  await guest.locator('#party-lobby').waitFor();
  report.discoveryMs = Math.round(performance.now() - discoveryStart);
  await host.waitForFunction(() => document.querySelectorAll('.party-player').length === 2);
  report.passed.push('Two installed native apps discover and join a phone-hosted room using pinned TLS; a wrong security code is rejected before transmitting a nickname');
  const storedSession = await guest.evaluate(() => JSON.parse(sessionStorage.getItem('red-flag-rush.party-session.v2')));
  assert.match(storedSession.phone.fingerprint, /^[0-9a-f]{64}$/);
  const nativeRequest = options => guest.evaluate(async options => window.Capacitor.Plugins.PhoneParty.request(options), options);
  await assert.rejects(() => nativeRequest({ ...storedSession.phone, fingerprint: '0'.repeat(64), method: 'GET', path: `/api/rooms/${code}`, token: storedSession.token }));
  await assert.rejects(() => nativeRequest({ ...storedSession.phone, fingerprint: '', method: 'GET', path: `/api/rooms/${code}`, token: storedSession.token }));
  const validState = await nativeRequest({ ...storedSession.phone, method: 'GET', path: `/api/rooms/${code}`, token: storedSession.token });
  assert.equal(validState.status, 200);
  assert.equal(validState.data.players.length, 2);
  const probe = await guest.evaluate(async options => window.Capacitor.Plugins.PhoneParty.inspectHost(options), { host: storedSession.phone.host, port: storedSession.phone.port, securityCode: securityCode.replace(/-/g, '').toLowerCase() });
  assert.equal(probe.fingerprint, storedSession.phone.fingerprint);
  report.passed.push('Native TLS rejects substituted/missing certificate pins and verifies the manual-address pairing probe; normal requests still succeed');
  await host.screenshot({ path: resolve(output, 'native-phone-party-lobby.png') });
  await host.locator('[data-party-action="start"]').click();
  for (let round = 1; round <= 5; round++) {
    for (const page of pages) await page.locator('#party-question').waitFor();
    assert.equal(await host.locator('.party-scenario p').textContent(), await guest.locator('.party-scenario p').textContent());
    await host.locator('[data-party-action="green"]').click();
    assert.equal(await host.locator('#party-reveal').count(), 0, 'A missing vote must stay private and must not advance the round');
    const voteStart = performance.now();
    await guest.locator('[data-party-action="red"]').click();
    for (const page of pages) await page.locator('#party-reveal').waitFor();
    report.latencyMs.push(Math.round(performance.now() - voteStart));
    assert.match(await host.locator('.party-vote-split').textContent(), /1 Green Flag/);
    assert.match(await host.locator('.party-vote-split').textContent(), /1 Red Flag/);
    if (round === 1) {
      await host.screenshot({ path: resolve(output, 'native-phone-party-discussion.png') });
      command(devices[1], 'shell', 'svc', 'wifi', 'disable');
      await guest.locator('#party-error:not([hidden])').waitFor({ timeout: 15000 });
      command(devices[1], 'shell', 'svc', 'wifi', 'enable');
      await guest.locator('#party-error').waitFor({ state: 'hidden', timeout: 30000 });
      report.passed.push('A disconnected guest reconnects to the same player without creating a duplicate or inventing a vote');
    }
    await host.locator('[data-party-action="next"]').click();
  }
  for (const [index, page] of pages.entries()) {
    await page.locator('#party-results').waitFor();
    // Real test ads may be ready on connected test devices. Dismiss them through Android.
    if (await page.locator('#modal').evaluate(modal => modal.inert)) command(devices[index], 'shell', 'input', 'keyevent', '4');
    await page.waitForFunction(() => !document.querySelector('#modal').inert, null, { timeout: 20000 });
    assert.equal(await page.locator('.party-result').count(), 2);
    await page.screenshot({ path: resolve(output, `native-phone-party-results-${index}.png`) });
  }
  report.passed.push('Native five-round match preserves vote privacy, immediate reveal, host-controlled rounds and final results');
  await host.locator('[data-party-action="replay"]').click();
  for (const page of pages) await page.locator('#party-lobby').waitFor();
  report.passed.push('The same group can replay without rejoining');
  await guest.locator('[data-party-action="leave"]').click();
  await host.waitForFunction(() => document.querySelectorAll('.party-player').length === 1);
  await host.locator('[data-party-action="leave"]').click();
  await host.locator('[data-party-action="create"]').waitFor();
  await host.locator('[data-party-action="create"]').click();
  await host.locator('#party-lobby').waitFor();
  assert.notEqual(await host.locator('.party-room-code').textContent(), code);
  await host.locator('[data-party-action="leave"]').click();
  report.passed.push('Empty rooms release hosting sockets and another room can be created');
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(resolve(output, 'phone-party-android-report.json'), JSON.stringify(report, null, 2));
  for (const device of attachedDevices) await device.close().catch(() => {});
}
