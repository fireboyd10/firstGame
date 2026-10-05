import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, '.qa');
await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5175, strictPort: true } });
await server.listen();
const port = server.httpServer.address().port;
const report = { passed: [], errors: [] };
let browser;
try {
  for (const channel of ['msedge', 'chrome', undefined]) {
    try { browser = await chromium.launch({ channel, headless: true }); break; } catch {}
  }
  assert(browser, 'Install a browser to run the ad regression check.');
  for (const mode of ['slow', 'ready', 'failure', 'party']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await context.route('**/src/ads/ad-manager.ts', async route => {
      const response = await route.fetch();
      const code = await response.text();
      const start = code.indexOf('export async function createAdManager(');
      assert(start >= 0);
      // Keep the real manager and game UI. Substitute only the native gateway.
      const factory = `export async function createAdManager(policy = AD_POLICY) {
        window.__adCalls = [];
        const gateway = {
          initialize: async () => {},
          prepareInterstitial: async () => {
            window.__adCalls.push({ kind: 'prepare' });
            if (${JSON.stringify(mode)} === 'slow') await new Promise(resolve => { window.__loadAd = resolve; });
          },
          showInterstitial: async () => {
            window.__adCalls.push({ kind: 'show', gameVisible: !document.querySelector('#game').hidden, resultsVisible: !document.querySelector('#results').hidden });
            if (${JSON.stringify(mode)} === 'failure') throw new Error('No ad available');
            await new Promise(resolve => { window.__dismissAd = resolve; });
          },
        };
        const manager = new AdManager(gateway, adUnitsFor('android'), policy, () => 0);
        await manager.initialize(true);
        return manager;
      }`;
      await route.fulfill({ response, body: code.slice(0, start) + factory });
    });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.clock.install();
    await page.goto(`http://127.0.0.1:${port}/`);
    if (mode === 'party') {
      const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const guest = await guestContext.newPage();
      guest.on('pageerror', error => report.errors.push(error.message));
      await guest.goto(`http://127.0.0.1:${port}/`);
      await page.locator('[data-action="party-open"]').click();
      await page.locator('#party-name').fill('Host');
      await page.locator('#party-length').selectOption('5');
      await page.locator('[data-party-action="create"]').click();
      await page.locator('#party-lobby').waitFor();
      const code = (await page.locator('.party-room-code').textContent()).trim();
      await guest.locator('[data-action="party-open"]').click();
      await guest.locator('#party-name').fill('Guest');
      await guest.locator('#party-code').fill(code);
      await guest.locator('[data-party-action="join"]').click();
      await guest.locator('#party-lobby').waitFor();
      await page.waitForFunction(() => document.querySelectorAll('.party-player').length === 2);
      await page.locator('[data-party-action="start"]').click();
      for (let round = 0; round < 5; round++) {
        for (const player of [page, guest]) {
          await player.locator('#party-question').waitFor();
          await player.locator('[data-party-action="green"]').click();
        }
        await page.locator('#party-reveal').waitFor();
        await page.locator('[data-party-action="next"]').click();
      }
      await page.waitForFunction(() => window.__adCalls.some(call => call.kind === 'show'));
      assert.equal(await page.locator('#party-results').isVisible(), true);
      assert.equal(await page.locator('#modal').evaluate(modal => modal.inert), true);
      await page.locator('[data-party-action="replay"]').evaluate(button => button.click());
      assert.equal(await page.locator('#party-results').isVisible(), true);
      await page.evaluate(() => window.__dismissAd());
      await page.waitForFunction(() => !document.querySelector('#modal').inert);
      await page.locator('[data-party-action="replay"]').click();
      await page.locator('#party-lobby').waitFor();
      assert.equal((await page.evaluate(() => window.__adCalls)).filter(call => call.kind === 'show').length, 1);
      report.passed.push('Completed party locks its modal through dismissal and replays without a navigation ad');
      await guestContext.close();
      await context.close();
      continue;
    }
    await page.locator('[data-action="start"]').click();
    await page.locator('[data-action="begin"]').click();
    for (let card = 0; card < 10; card++) {
      await page.locator('[data-action="green"]').click();
      await page.clock.runFor(2250);
    }
    const calls = () => page.evaluate(() => window.__adCalls);
    if (mode === 'ready') {
      const shown = (await calls()).filter(call => call.kind === 'show');
      assert.equal(shown.length, 1);
      assert.equal(shown[0].gameVisible, false);
      assert.equal(shown[0].resultsVisible, true);
      assert.equal(await page.locator('#app').evaluate(app => app.inert), true);
      await page.evaluate(() => {
        document.querySelector('[data-action="replay"]').click();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      assert.equal(await page.locator('#results').isVisible(), true);
      assert.equal((await calls()).filter(call => call.kind === 'show').length, 1);
      await page.evaluate(() => window.__dismissAd());
      await page.waitForFunction(() => !document.querySelector('#app').inert);
      report.passed.push('Ready ad presents at completion; replay/key input blocked until dismissal; no duplicate presentation');
    }
    if (mode === 'failure') {
      await page.waitForFunction(() => !document.querySelector('#app').inert);
      report.passed.push('Native presentation failure releases controls');
    }
    await page.locator('[data-action="replay"]').click();
    assert.equal(await page.locator('#solo-progress').textContent(), '0 / 10');
    if (mode === 'slow') {
      assert.equal((await calls()).filter(call => call.kind === 'prepare').length, 1);
      await page.evaluate(() => window.__loadAd());
      await page.clock.runFor(7000);
      assert.equal((await calls()).filter(call => call.kind === 'show').length, 0);
      report.passed.push('Late load is skipped without duplicate requests or ads over the next game');
    }
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(resolve(output, 'ad-browser-report.json'), JSON.stringify(report, null, 2));
  await browser?.close();
  await server.close();
}
