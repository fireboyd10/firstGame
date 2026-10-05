import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
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
  await guest.locator('#party-code').fill(code);
  const discoveryStart = performance.now();
  await guest.locator('[data-party-action="join"]').click();
  await guest.locator('#party-lobby').waitFor();
  report.discoveryMs = Math.round(performance.now() - discoveryStart);
  await host.waitForFunction(() => document.querySelectorAll('.party-player').length === 2);
  report.passed.push('Two installed native apps discover and join a phone-hosted room through Wi-Fi, without a computer server');
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
