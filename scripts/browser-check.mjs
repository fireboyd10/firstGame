// Run against `npm run preview`. Uses an existing Edge or Chrome installation.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';

const project = resolve(import.meta.dirname, '..');
const output = resolve(project, '.qa');
const base = new URL(process.env.BASE_URL || 'http://127.0.0.1:4173/');
await mkdir(output, { recursive: true });
const scenarios = JSON.parse(await readFile(resolve(project, 'server/data/scenarios.json'), 'utf8'));
const answers = new Map(scenarios.map((scenario) => [scenario.id, scenario.answer]));
const report = { base: base.href, browser: '', startedAt: new Date().toISOString(), passed: [], screenshots: [], errors: [], status: 'running' };
let browser;
let currentPage;
let fixtureServer;

async function check(name, task) {
  await task();
  report.passed.push(name);
  console.log(`PASS ${name}`);
}
async function visible(page, selector) {
  assert.equal(await page.locator(selector).isVisible(), true, `${selector} should be visible`);
}
async function shot(page, name) {
  await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true, animations: 'disabled' });
  report.screenshots.push(`${name}.png`);
}
function monitor(context, origin, label) {
  const status = { offline: false };
  context.on('page', (page) => {
    page.on('pageerror', (error) => report.errors.push(`${label}: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error' && !(status.offline && /ERR_INTERNET_DISCONNECTED|Failed to fetch|fetching the script/i.test(message.text()))) {
        report.errors.push(`${label}: console: ${message.text()}`);
      }
    });
  });
  context.on('request', (request) => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== origin) report.errors.push(`${label}: external request ${request.url()}`);
  });
  context.on('response', (response) => {
    if (response.status() >= 400) report.errors.push(`${label}: HTTP ${response.status()} ${response.url()}`);
  });
  context.on('requestfailed', (request) => {
    if (!status.offline && !/ERR_ABORTED/.test(request.failure()?.errorText || '')) report.errors.push(`${label}: request failed ${request.url()} ${request.failure()?.errorText}`);
  });
  return status;
}
async function timedPage(context, url = base.href) {
  const page = await context.newPage();
  currentPage = page;
  page.setDefaultTimeout(8000);
  await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') });
  await page.goto(url, { waitUntil: 'load' });
  await page.clock.pauseAt(new Date('2026-01-01T12:01:00Z'));
  return page;
}
async function answerFor(page) {
  const id = await page.locator('#scenario-card').getAttribute('data-scenario-id');
  assert(answers.has(id), `Unknown scenario ${id}`);
  return answers.get(id);
}
async function nextCard(page) {
  const previous = await page.locator('#scenario-card').getAttribute('data-scenario-id');
  await page.clock.runFor(2250);
  assert.equal(await page.locator('.choice-red').isEnabled(), true);
  assert.notEqual(await page.locator('#scenario-card').getAttribute('data-scenario-id'), previous, 'No immediately repeated scenario');
}
async function home(page) {
  if (await page.locator('#game').isVisible()) {
    if (!await page.locator('#modal').isVisible()) await page.locator('[data-action="pause"]').click();
    await page.locator('#modal [data-action="home"]').click();
  } else if (await page.locator('#results').isVisible()) await page.locator('#results [data-action="home"]').click();
}
async function layout(page, selectors, fitVertically = true) {
  const sizes = await page.evaluate(() => ({
    width: innerWidth, height: innerHeight,
    content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  assert(sizes.content <= sizes.width + 1, `Horizontal overflow: ${sizes.content} > ${sizes.width}`);
  for (const selector of selectors) {
    await visible(page, selector);
    const box = await page.locator(selector).boundingBox();
    assert(box && box.x >= -1 && box.x + box.width <= sizes.width + 1, `${selector} exceeds viewport width`);
    if (fitVertically) assert(box.y >= -1 && box.y + box.height <= sizes.height + 1, `${selector} exceeds viewport height ${sizes.height}: ${JSON.stringify(box)}`);
  }
}
async function readyForOffline(page) {
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { polling: 100, timeout: 15000 });
  const cached = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const entries = await Promise.all((await caches.keys()).filter((key) => key.startsWith('red-flag-rush:')).map(async (key) => (await (await caches.open(key)).keys()).map((request) => request.url)));
    return entries.flat();
  });
  assert(cached.some((url) => url.endsWith('/index.html')));
  assert(cached.some((url) => url.endsWith('/icons/icon-512.png')));
  return cached;
}

try {
  const launchErrors = [];
  for (const channel of process.env.BROWSER_CHANNEL ? [process.env.BROWSER_CHANNEL] : ['msedge', 'chrome', undefined]) {
    try {
      browser = await chromium.launch({ channel, headless: true });
      report.browser = `${channel ?? 'chromium'} ${browser.version()}`;
      break;
    } catch (error) { launchErrors.push(`${channel}: ${error.message}`); }
  }
  if (!browser) throw new Error(`Install Edge/Chrome or run npx playwright-core install chromium.\n${launchErrors.join('\n')}`);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const network = monitor(context, base.origin, 'main');
  const page = await timedPage(context);
  await check('Privacy policy opens from the footer with contact and data disclosures', async () => {
    await page.locator('[data-action="privacy"]').click();
    const policy = page.frameLocator('iframe[title="Red Flag Rush privacy policy"]');
    await policy.locator('h1').waitFor();
    assert.match(await policy.locator('body').textContent(), /anc\.darius@gmail\.com/);
    assert.match(await policy.locator('body').textContent(), /User Messaging Platform/);
    await shot(page, 'privacy-policy-390x844');
    await page.locator('[data-action="close-privacy"]').click();
    await visible(page, '#home');
  });
  await check('First launch, tutorial, and start', async () => {
    await visible(page, '#home-title');
    await page.locator('[data-action="start"]').click();
    await visible(page, '#modal[open]');
    await shot(page, 'tutorial-390x844');
    await page.locator('[data-action="begin"]').click();
    await visible(page, '#game');
    assert.equal(await page.locator('#solo-progress').textContent(), '0 / 10');
  });
  await check('Choice counts once; repeated input is locked', async () => {
    const answer = await answerFor(page);
    await page.locator(`[data-action="${answer}"]`).click();
    assert.equal(await page.locator('#solo-progress').textContent(), '1 / 10');
    assert.equal(await page.locator('.choice-red').isDisabled(), true);
    assert.equal(await page.locator('.choice-green').isDisabled(), true);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#solo-progress').textContent(), '1 / 10');
  });
  await nextCard(page);
  await check('Pointer snap-back and horizontal swipe', async () => {
    const box = await page.locator('#scenario-card').boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 12, y + 4, { steps: 3 });
    await page.mouse.up();
    assert.equal(await page.locator('.choice-red').isEnabled(), true);
    assert.equal(await page.locator('#scenario-card').evaluate((element) => element.style.transform), '');
    const answer = await answerFor(page);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + (answer === 'red' ? -112 : 112), y, { steps: 8 });
    await page.mouse.up();
    assert.equal(await page.locator('#solo-progress').textContent(), '2 / 10');
    assert.equal(await page.locator('.choice-red').isDisabled(), true);
  });
  await nextCard(page);
  await check('Keyboard and both choice buttons accept personal preferences', async () => {
    await page.keyboard.press('ArrowLeft');
    await nextCard(page);
    await page.locator('[data-action="green"]').click();
    await nextCard(page);
    await page.locator('[data-action="red"]').click();
    assert.equal(await page.locator('#solo-progress').textContent(), '5 / 10');
  });
  await nextCard(page);
  await check('Pause freezes timer; Escape resumes', async () => {
    await page.clock.runFor(350);
    await page.keyboard.press('Escape');
    await visible(page, '#modal[open]');
    const remaining = await page.locator('#timer-number').textContent();
    await page.clock.runFor(15000);
    assert.equal(await page.locator('#timer-number').textContent(), remaining);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#modal').isVisible(), false);
    await page.clock.runFor(300);
    assert.notEqual(await page.locator('#timer-number').textContent(), remaining);
  });
  await check('Visibility event pauses and requires an explicit resume', async () => {
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await visible(page, '#modal[open]');
    const remaining = await page.locator('#timer-number').textContent();
    await page.clock.runFor(10000);
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await page.locator('#timer-number').textContent(), remaining);
    await visible(page, '#modal[open]');
    await page.locator('[data-action="resume"]').click();
  });
  await check('Timer expiry allows a late answer; ten choices produce a verdict', async () => {
    await page.clock.runFor(31000);
    assert.equal(await page.locator('#solo-progress').textContent(), '5 / 10');
    assert.equal(await page.locator('.choice-red').isEnabled(), true);
    for (let i = 5; i < 10; i++) {
      await page.locator(`[data-action="${i % 2 ? 'green' : 'red'}"]`).click();
      await page.clock.runFor(2250);
    }
    await visible(page, '#results');
    assert.equal(await page.locator('#picks-made').textContent(), '10');
    assert.match(await page.locator('#chaos-percent').textContent(), /^\d+%$/);
    assert.match(await page.locator('#green-percent').textContent(), /^\d+%$/);
    await shot(page, 'results-390x844');
  });
  await check('Share clipboard and manual-copy fallbacks', async () => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base.origin });
    await page.evaluate(() => Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }));
    await page.locator('[data-action="share"]').click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /RED FLAG RUSH/);
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new DOMException('Blocked', 'NotAllowedError')) } }));
    await page.locator('[data-action="share"]').click();
    await visible(page, '#share-fallback');
    assert.match(await page.locator('#share-text').inputValue(), /RED FLAG RUSH/);
  });
  await check('Replay and restart reset the run', async () => {
    await page.locator('[data-action="replay"]').click();
    await visible(page, '#game');
    assert.equal(await page.locator('#solo-progress').textContent(), '0 / 10');
    const answer = await answerFor(page);
    await page.locator(`[data-action="${answer}"]`).click();
    await page.locator('.topbar [data-action="restart"]').click();
    assert.equal(await page.locator('#solo-progress').textContent(), '0 / 10');
    assert.equal(await page.locator('.choice-red').isEnabled(), true);
  });
  await check('Mute and tutorial state persist; Space starts', async () => {
    await page.locator('[data-action="mute"]').click();
    assert.equal(await page.locator('[data-action="mute"]').getAttribute('aria-pressed'), 'true');
    await page.reload({ waitUntil: 'load' });
    await visible(page, '#home');
    assert.equal(await page.locator('#modal').isVisible(), false);
    assert.equal(await page.locator('[data-action="mute"]').getAttribute('aria-pressed'), 'true');
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('Space');
    await visible(page, '#game');
  });
  for (const [width, height] of [[320, 568], [360, 800], [390, 844], [412, 915], [1440, 1000], [844, 390]]) {
    await check(`Responsive home/game/feedback ${width}x${height}`, async () => {
      await home(page);
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.scrollTo(0, 0));
      await layout(page, ['.start-button'], width < height);
      await shot(page, `home-${width}x${height}`);
      await page.locator('[data-action="start"]').click();
      await page.clock.runFor(100);
      await page.evaluate(() => window.scrollTo(0, 0));
      await layout(page, ['.choice-red', '.choice-green', '#timer', '.topbar [data-action="pause"]'], width < height);
      for (const selector of ['.choice-red', '.choice-green', '.topbar [data-action="pause"]']) {
        const box = await page.locator(selector).boundingBox();
        assert(box.width >= 43 && box.height >= 43, `${selector} needs an approximately 44px touch target`);
      }
      await shot(page, `game-${width}x${height}`);
      const answer = await answerFor(page);
      await page.locator(`[data-action="${answer}"]`).click();
      await layout(page, ['.choice-red', '.choice-green', '#feedback'], width < height);
      if (width === 320) await shot(page, `feedback-${width}x${height}`);
      if (width > height && width < 1000) await visible(page, '.landscape-note');
    });
  }
  await home(page);
  await check('Every scenario fits the shortest phone', async () => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.locator('[data-action="start"]').click();
    for (const scenario of scenarios) {
      // Stress the production typography with the entire editorial content set.
      await page.evaluate((card) => {
        document.querySelector('#scenario-text').textContent = card.text;
        document.querySelector('#scenario-card').classList.toggle('long-text', card.text.length > 110);
        document.querySelector('#feedback p').textContent = 'Your choice is in.';
      }, scenario);
      await layout(page, ['#scenario-card', '#feedback', '.choice-red', '.choice-green']);
    }
    await shot(page, 'long-card-320x568');
    await home(page);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await check('Manifest, production worker, and PNG assets are valid', async () => {
    const manifestUrl = await page.locator('link[rel="manifest"]').evaluate((link) => link.href);
    const manifest = await (await context.request.get(manifestUrl)).json();
    assert.equal(manifest.display, 'standalone');
    assert.equal(new URL(manifest.start_url, manifestUrl).href, base.href);
    assert(manifest.icons.some((icon) => icon.purpose === 'maskable'));
    for (const icon of manifest.icons) {
      const response = await context.request.get(new URL(icon.src, manifestUrl).href);
      assert.equal(response.status(), 200);
      const data = await response.body();
      assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert.equal(`${data.readUInt32BE(16)}x${data.readUInt32BE(20)}`, icon.sizes);
    }
    const apple = await page.locator('link[rel="apple-touch-icon"]').evaluate((link) => link.href);
    assert.equal((await context.request.get(apple)).status(), 200);
    const worker = await context.request.get(new URL('service-worker.js', base).href);
    assert.equal(worker.status(), 200);
    assert.doesNotMatch(await worker.text(), /__RFR_/);
  });
  await check('Production service worker supports offline reload, route, and play', async () => {
    await readyForOffline(page);
    network.offline = true;
    await context.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    await visible(page, '#home');
    await page.goto(new URL('offline-check/deep', base).href, { waitUntil: 'load' });
    await visible(page, '#home');
    assert.equal(await page.evaluate(() => document.baseURI), base.href);
    await page.locator('[data-action="privacy"]').click();
    const policy = page.frameLocator('iframe[title="Red Flag Rush privacy policy"]');
    await policy.locator('h1').waitFor();
    assert.match(await policy.locator('body').textContent(), /anc\.darius@gmail\.com/);
    await page.locator('[data-action="close-privacy"]').click();
    await page.locator('[data-action="start"]').click();
    const answer = await answerFor(page);
    await page.locator(`[data-action="${answer}"]`).click();
    assert.equal(await page.locator('#solo-progress').textContent(), '1 / 10');
    await shot(page, 'offline-game');
    await context.setOffline(false);
    network.offline = false;
  });
  await check('Unavailable storage, service worker, audio, and haptics remain playable', async () => {
    const fallback = await browser.newContext({ viewport: { width: 360, height: 800 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    monitor(fallback, base.origin, 'fallback');
    await fallback.addInitScript(() => {
      delete Navigator.prototype.serviceWorker;
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
      Object.defineProperty(window, 'AudioContext', { value: undefined });
      Object.defineProperty(window, 'webkitAudioContext', { value: undefined });
      Object.defineProperty(navigator, 'vibrate', { value: undefined });
    });
    const fallbackPage = await timedPage(fallback);
    await fallbackPage.locator('[data-action="start"]').click();
    await fallbackPage.locator('[data-action="begin"]').click();
    await fallbackPage.locator(`[data-action="${await answerFor(fallbackPage)}"]`).click();
    assert.equal(await fallbackPage.locator('#solo-progress').textContent(), '1 / 10');
    await fallbackPage.locator('[data-action="mute"]').click();
    assert.equal(await fallbackPage.locator('[data-action="mute"]').getAttribute('aria-pressed'), 'true');
    await fallback.close();
    currentPage = page;
  });
  await check('Unmodified build works at a nested hosting subpath and offline', async () => {
    const dist = resolve(project, 'dist');
    const prefix = '/games/red-flag-rush/';
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
    fixtureServer = createServer(async (request, response) => {
      try {
        const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        if (!path.startsWith(prefix)) { response.writeHead(404).end(); return; }
        const file = resolve(dist, path.slice(prefix.length) || 'index.html');
        if (!file.startsWith(`${dist}${sep}`)) { response.writeHead(403).end(); return; }
        const data = await readFile(file);
        response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        response.end(data);
      } catch { if (!response.headersSent) response.writeHead(404); response.end(); }
    });
    await new Promise((done) => fixtureServer.listen(0, '127.0.0.1', done));
    const nested = new URL(`http://127.0.0.1:${fixtureServer.address().port}${prefix}`);
    const nestedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const nestedNetwork = monitor(nestedContext, nested.origin, 'subpath');
    const nestedPage = await timedPage(nestedContext, nested.href);
    await nestedPage.locator('[data-action="start"]').click();
    await nestedPage.locator('[data-action="begin"]').click();
    await readyForOffline(nestedPage);
    nestedNetwork.offline = true;
    await nestedContext.setOffline(true);
    await nestedPage.goto(new URL('offline/deep', nested).href, { waitUntil: 'load' });
    assert.equal(await nestedPage.evaluate(() => document.baseURI), nested.href);
    await nestedPage.locator('[data-action="start"]').click();
    await nestedPage.locator(`[data-action="${await answerFor(nestedPage)}"]`).click();
    assert.equal(await nestedPage.locator('#solo-progress').textContent(), '1 / 10');
    await shot(nestedPage, 'subpath-offline-game');
    await nestedContext.close();
    await new Promise((done) => fixtureServer.close(done));
    fixtureServer = null;
    currentPage = page;
  });
  await check('No uncaught errors, missing assets, or external runtime requests', async () => assert.deepEqual(report.errors, []));
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack || String(error);
  console.error(report.failure);
  if (currentPage && !currentPage.isClosed()) {
    try { await shot(currentPage, 'failure'); } catch { /* Preserve the original failure. */ }
  }
  process.exitCode = 1;
} finally {
  if (fixtureServer) await new Promise((done) => fixtureServer.close(done));
  if (browser) await browser.close();
  report.finishedAt = new Date().toISOString();
  await writeFile(resolve(output, 'browser-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${report.status.toUpperCase()}: ${report.passed.length} checks. Report and screenshots: .qa/`);
}
