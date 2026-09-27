import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { RoomService } from '../server/rooms.mjs';
import { createPartyServer } from '../server/http.mjs';

const project = resolve(import.meta.dirname, '..');
const scenarios = JSON.parse(await readFile(resolve(project, 'server/data/scenarios.json'), 'utf8'));
let clockOffset = 0;
const service = new RoomService(scenarios, { now: () => Date.now() + clockOffset });
const origins = new Set();
const server = createPartyServer({ service, dist: resolve(project, 'dist'), origins });
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
origins.add(base);
await mkdir(resolve(project, '.qa'), { recursive: true });
const report = { passed: [], errors: [] };
let browser;
try {
  for (const channel of ['msedge', 'chrome']) {
    try { browser = await chromium.launch({ channel, headless: true }); break; } catch { /* Try another installed browser. */ }
  }
  assert(browser, 'Install Edge or Chrome to run the browser check.');
  const people = [];
  for (const name of ['Ada', 'Bea', 'Cleo']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', (error) => report.errors.push(error.message));
    await page.goto(base);
    await page.locator('[data-action="party-open"]').click();
    await page.locator('#party-name').fill(name);
    people.push({ context, page });
  }
  const [host, guest, third] = people.map((person) => person.page);
  await host.locator('#party-length').selectOption('5');
  await host.locator('[data-party-action="create"]').click();
  await host.locator('#party-lobby').waitFor();
  const code = (await host.locator('.party-room-code').textContent()).trim();
  for (const page of [guest, third]) {
    await page.locator('#party-code').fill(code);
    await page.locator('[data-party-action="join"]').click();
    await page.locator('#party-lobby').waitFor();
  }
  await host.waitForFunction(() => document.querySelectorAll('.party-player').length === 3);
  assert.equal(await guest.locator('[data-party-action="start"]').count(), 0);
  report.passed.push('Three independent phones create and join a room');
  await third.reload();
  await third.locator('[data-action="party-open"]').click();
  await third.locator('#party-lobby').waitFor();
  report.passed.push('Reload rejoins the same player without duplicate names');
  await host.locator('[data-party-action="start"]').click();
  for (let round = 1; round <= 5; round++) {
    for (const page of [host, guest, third]) await page.locator('#party-question').waitFor();
    const text = await host.locator('.party-scenario p').textContent();
    assert.equal(await guest.locator('.party-scenario p').textContent(), text);
    for (const page of [host, guest]) {
      await page.locator(`[data-party-action="${page === guest ? 'red' : 'green'}"]`).click();
      await page.waitForFunction(() => document.querySelector('#party-status')?.textContent.includes('Your vote is in'));
    }
    assert.equal(await host.locator('#party-reveal').count(), 0);
    assert.equal(service.state(code, service.rooms.get(code).players[0].token).phase, 'question');
    if (round === 1) {
      // A slow voter gets more than 30 seconds. The production service has no test endpoint.
      clockOffset += 31000;
      const room = service.rooms.get(code);
      assert.equal(service.state(code, room.players[0].token).phase, 'question');
    } else {
      const room = service.state(code, service.rooms.get(code).players[0].token);
      assert(room.serverNow < room.deadline, 'Final vote should arrive before the timer expires');
    }
    await third.locator('[data-party-action="green"]').click();
    assert.equal(service.state(code, service.rooms.get(code).players[0].token).phase, 'reveal');
    for (const page of [host, guest, third]) await page.locator('#party-reveal').waitFor();
    assert.match(await host.locator('.party-vote-split').textContent(), /2 Green Flags/);
    assert.match(await host.locator('.party-vote-split').textContent(), /1 Red Flag/);
    assert.equal(await guest.locator('[data-party-action="next"]').count(), 0);
    if (round === 1) {
      await host.setViewportSize({ width: 320, height: 568 });
      assert(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert(await host.locator('#modal').evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
      await host.screenshot({ path: resolve(project, '.qa/party-discussion.png') });
      report.passed.push('Private votes, extra time for a slow voter, disagreement, host-controlled discussion, 320px layout');
    }
    await host.locator('[data-party-action="next"]').click();
  }
  report.passed.push('The final vote reveals results immediately before the timer expires');
  for (const page of [host, guest, third]) await page.locator('#party-results').waitFor();
  const result = await host.locator('.party-ranking').textContent();
  assert.match(result, /Tied for most chaotic/);
  assert.equal(await host.locator('.party-result-heading').count(), 3);
  assert.equal((result.match(/100%/g) || []).length, 4);
  assert.equal((result.match(/0 of \d+ red flags accepted/g) || []).length, 1);
  assert(!/[—–]|--/.test(result));
  await host.screenshot({ path: resolve(project, '.qa/party-results.png') });
  report.passed.push('Full five-round game, personal percentages, shared ranks and plain-language verdicts');
  await host.locator('[data-party-action="replay"]').click();
  await host.locator('#party-lobby').waitFor();
  await host.locator('[data-party-action="leave"]').click();
  await guest.locator('[data-party-action="start"]').waitFor();
  report.passed.push('Replay resets scores and leaving transfers hosting');
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(resolve(project, '.qa/party-browser-report.json'), JSON.stringify(report, null, 2));
  await browser?.close();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
