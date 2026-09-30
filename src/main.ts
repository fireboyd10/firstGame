import './styles.css';
import { GameEngine } from './game/engine';
import type { Answer } from './game/types';
import { loadPreferences, savePreferences } from './game/storage';
import { partyVerdict, tastePercent } from './multiplayer/personality';
import { Sound, vibrate } from './audio/sound';
import { heroArt, cardArt, icon } from './art';
import { bindSwipe } from './swipe';
import { setupPwa } from './pwa';
import { isNativePlatform, setupNativeLifecycle, minimizeNativeApp } from './platform/native';
import { createPartyUi } from './multiplayer/ui';
import { createAdManager, type AdManager } from './ads/ad-manager';
import { createPurchaseManager, PurchaseManager } from './purchases/purchases';
import { BASE_CATEGORIES } from './data/scenario-bank';
import { BUNDLE_PRODUCT_ID, BUNDLE_FALLBACK_PRICE, BUNDLE_TITLE, PACKS } from './purchases/products';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="shell">
    <header class="topbar">
      <a class="brand" href="#" aria-label="Red Flag Rush home">${icon('flag')}<span>RED FLAG<span class="brand-light"> RUSH</span></span></a>
      <div class="top-actions">
        <button class="text-button" data-action="help" aria-label="How to play">How to play ${icon('eye')}</button>
        <button class="icon-button" data-action="restart" aria-label="Restart run" hidden>${icon('restart')}</button>
        <button class="icon-button" data-action="mute" aria-label="Mute sound"></button>
        <button class="icon-button" data-action="pause" aria-label="Pause game" hidden>${icon('pause')}</button>
      </div>
    </header>
    <p class="landscape-note">A little more room in portrait. Still ready to play here.</p>
    <main>
      <section id="home" class="home view" aria-labelledby="home-title">
        <div class="home-grid">
          <div class="home-intro">
            <p class="eyebrow"><span class="live-dot"></span> BRING YOUR FRIENDS. EXPLAIN YOUR TASTE.</p>
            <h1 id="home-title">RED FLAG<span>RUSH<span class="title-spark">✳</span></span></h1>
            <p class="subtitle">SWIPE THE SIGNS</p>
          </div>
          <div class="home-art">${heroArt()}<span class="art-caption">BE HONEST. WOULD YOU STILL GO THERE?</span></div>
          <div class="home-actions">
            <p class="home-description">Red flag, but I like it.<br>Your next group chat argument starts here.</p>
            <div class="rules-strip"><span>2 to 8 friends</span><i></i><span>Same Wi-Fi</span><i></i><span>Your call.</span></div>
            <button class="primary-button" data-action="party-open">PLAY WITH FRIENDS ${icon('arrow')}</button>
            <button class="secondary-button start-button" data-action="start">FIND MY TYPE</button>
            <button class="text-button" data-action="shop-open">UNLOCK SPICY TOPICS 🔥</button>
            <p class="home-best">10 choices. One very personal reveal.</p>
          </div>
        </div>
        <div class="home-bottom"><span>READ THE ROOM.</span><span>TRUST YOUR INSTINCTS.</span><span>COMPARE YOUR TASTE.</span></div>
      </section>
      <section id="game" class="game view" aria-label="Current run" hidden>
        <div class="game-hud">
          <div><span class="tiny-label">YOUR PICKS</span><strong id="solo-progress">0 / 10</strong></div>
          <div class="run-label"><span class="tiny-label">YOUR GUT. YOUR CALL.</span><span id="round-label">SCENARIO 01</span></div>
        </div>
        <div class="timer-label"><span id="pace-label">WARMING UP</span><span id="timer-number" aria-hidden="true">30.0s</span></div>
        <div class="timer-track" id="timer" role="progressbar" aria-label="Time remaining" aria-valuemin="0" aria-valuemax="30" aria-valuenow="30"><div id="timer-fill"></div></div>
        <div class="card-stage">
          <article id="scenario-card" class="scenario-card" aria-label="Scenario. Swipe left for red or right for green.">
            <div class="card-top"><span id="category">BOUNDARIES</span><span id="difficulty">01 / 03</span></div>
            <div id="card-art"></div>
            <p id="scenario-text"></p>
            <span class="card-foot">WHAT’S YOUR READ?</span>
            <div class="swipe-stamp stamp-red">RED FLAG</div><div class="swipe-stamp stamp-green">GREEN FLAG</div>
          </article>
        </div>
        <div class="feedback" id="feedback" aria-live="polite" aria-atomic="true"><strong>Your gut has something to say.</strong><p>Swipe the card or choose below.</p></div>
        <div class="choices"><button class="choice choice-red" data-action="red" aria-label="Red flag">${icon('flag')}<span>RED FLAG<small>← SWIPE LEFT</small></span></button><button class="choice choice-green" data-action="green" aria-label="Green flag"><span>GREEN FLAG<small>SWIPE RIGHT →</small></span>${icon('flag')}</button></div>
        <div class="streak-bar"><span>🚩 <strong id="red-picks">0</strong> RED PICKS</span><span>💚 <strong id="green-picks">0</strong> GREEN PICKS</span></div>
      </section>
      <section id="results" class="results view" aria-labelledby="results-title" hidden>
        <div class="result-burst" aria-hidden="true">${icon('spark')}${icon('heart')}${icon('spark')}</div>
        <p class="eyebrow" id="result-eyebrow">YOUR TASTE HAS ENTERED THE CHAT</p><h2 id="results-title">Your verdict</h2>
        <div class="score-medallion"><span class="tiny-label">TASTE FOR CHAOS</span><strong id="chaos-percent">0%</strong><span id="taste-detail"></span></div>
        <div class="result-stats solo-stats"><div><strong id="green-percent">0%</strong><span>GREEN FLAG APPRECIATION</span></div><div><strong id="picks-made">10</strong><span>YOUR PICKS</span></div></div>
        <p class="result-message" id="result-message"></p>
        <p class="verdict-note">A little game-night gossip about your taste. Context is still allowed.</p>
        <button class="primary-button" data-action="replay">ONE MORE RUN ${icon('restart')}</button>
        <button class="secondary-button" data-action="share">SHARE MY VERDICT ${icon('share')}</button>
        <div id="share-fallback" hidden><label for="share-text">Copy your result:</label><textarea id="share-text" readonly rows="3"></textarea></div>
        <button class="text-button back-home" data-action="home">Back to the start</button>
      </section>
    </main>
    <div class="update-banner" id="update-banner" hidden><span>A fresh version is ready.</span><button data-action="update">Update & reload ${icon('arrow')}</button></div>
    <footer class="footer"><span>Entertainment and reflection only — not clinical advice.</span><button class="text-button" data-action="ad-privacy" hidden>Ad privacy choices</button><span class="offline-label" id="offline-status">NO ACCOUNTS. JUST INSTINCTS.</span></footer>
    <p id="announcement" class="sr-only" role="status" aria-live="polite"></p>
    <dialog id="modal" aria-labelledby="modal-title"><div id="modal-content"></div></dialog>
    <div class="toast" id="toast" role="status" hidden></div>
  </div>`;

function el<T extends HTMLElement = HTMLElement>(selector: string): T { return app.querySelector<T>(selector)!; }
const engine = new GameEngine();
const sound = new Sound();
let preferences = loadPreferences();
let screen: 'home' | 'game' | 'results' = 'home';
let feedbackRemaining = 0;
let lastFrame = performance.now();
let modalKind: 'tutorial' | 'pause' | 'party' | 'shop' | null = null;
let update: (() => void) | null = null;
let toastTimeout = 0;
let appActive = true;
const modal = el<HTMLDialogElement>('#modal');
const card = el('#scenario-card');
const party = createPartyUi(el('#modal-content'), {
  onOpen() { modalKind = 'party'; if (!modal.open) modal.showModal(); },
  // A finished party match is a natural breakpoint, same schedule as solo runs.
  // A finished party match is a natural breakpoint, same schedule as solo runs.
  // Ad first, then close — a defensive close can never swallow a due ad.
  onClose() { void ads?.maybeShowInterstitial(); closeModal(); },
  onGameFinished() { ads?.recordGameCompleted(); },
  purchases: () => purchaseManager,
  onPurchase(packIds) {
    const names = packIds.map((id) => PACKS.find((pack) => pack.packId === id)?.title ?? id).join(', ');
    toast(`Unlocked: ${names}. The deck just got more interesting.`);
    if (modalKind === 'shop') showShop();
  },
  sound,
  onMute: toggleSound,
});
const resetSwipe = bindSwipe(card, () => screen === 'game' && engine.state.phase === 'playing' && !modal.open, choose);
// Ads and purchases: native apps only. Web keeps base content and stays ad-free.
let ads: AdManager | null = null;
void createAdManager().then((manager) => {
  ads = manager;
  el('[data-action="ad-privacy"]').hidden = !manager.privacyOptionsRequired;
});
let purchaseManager: PurchaseManager = new PurchaseManager(null);
let purchasesSettled = false;
const purchasesReady: Promise<void> = createPurchaseManager().then((manager) => { purchaseManager = manager; purchasesSettled = true; });

function setScreen(next: typeof screen): void {
  screen = next;
  for (const name of ['home', 'game', 'results']) el(`#${name}`).hidden = name !== next;
  el('[data-action="pause"]').hidden = next !== 'game';
  el('[data-action="restart"]').hidden = next !== 'game';
  el('[data-action="help"]').hidden = next === 'game';
  el('#update-banner').hidden = !update || next === 'game';
}

function announce(message: string): void { el('#announcement').textContent = message; }
function toast(message: string): void {
  clearTimeout(toastTimeout);
  el('#toast').textContent = message;
  el('#toast').hidden = false;
  toastTimeout = window.setTimeout(() => { el('#toast').hidden = true; }, 2800);
}
function refreshSound(): void {
  sound.muted = preferences.muted;
  const button = el<HTMLButtonElement>('[data-action="mute"]');
  button.innerHTML = icon(preferences.muted ? 'mute' : 'sound');
  button.setAttribute('aria-label', preferences.muted ? 'Unmute sound' : 'Mute sound');
  button.setAttribute('aria-pressed', String(preferences.muted));
}
function toggleSound(): void {
  preferences = savePreferences({ muted: !preferences.muted });
  refreshSound(); sound.unlock();
}
function closeModal(): void { if (modalKind === 'party') party.hide(); if (modal.open) modal.close(); modalKind = null; }

/** Premium packs shop: non-consumable unlocks through the stores' official billing. */
function showShop(): void {
  if (screen === 'game') return;
  modalKind = 'shop';
  const store = purchaseManager;
  // Native billing swaps in async; the web build never has a store. While native
  // init is pending, prices show disabled instead of the wrong "in the app" web
  // fallback, and the shop re-renders as soon as the store answers.
  const storePending = isNativePlatform() && !store.storeAvailable && !purchasesSettled;
  const storeMissing = isNativePlatform() && !store.storeAvailable && purchasesSettled;
  const packRow = (packId: string, title: string, tagline: string, productId: string, fallback: string) => {
    const owned = store.owns(packId);
    const price = store.priceFor(productId) ?? fallback;
    const action = owned
      ? '<span class="pack-owned">UNLOCKED ✓</span>'
      : store.storeAvailable
        ? `<button class="secondary-button" data-action="buy-pack" data-product="${productId}">${price}</button>`
        : storePending
          ? `<button class="secondary-button" disabled>${price}</button>`
          : storeMissing
            ? ''
            : '<span class="pack-owned">IN THE APP</span>';
    return `<div class="pack-row"><div><strong>${title}</strong><span>${tagline}</span></div>${action}</div>`;
  };
  const bundleAction = store.storeAvailable
    ? `<button class="primary-button" data-action="buy-pack" data-product="${BUNDLE_PRODUCT_ID}">${store.priceFor(BUNDLE_PRODUCT_ID) ?? BUNDLE_FALLBACK_PRICE}</button>`
    : storePending
      ? `<button class="primary-button" disabled>${BUNDLE_FALLBACK_PRICE}</button>`
      : storeMissing
        ? ''
        : '<span class="pack-owned">IN THE APP</span>';
  const footer = store.storeAvailable
    ? '<button class="text-button" data-action="restore-purchases">Restore purchases</button>'
    : storePending
      ? '<p class="modal-description">Contacting the store…</p>'
      : storeMissing
        ? '<p class="modal-description">The store is unavailable on this device right now. Purchases need Google Play or the App Store.</p>'
        : '<p class="modal-description">Purchases happen in the Android/iOS app. Grab it to unlock these decks.</p>';
  el('#modal-content').innerHTML = `<div class="modal-heading"><span class="eyebrow">SPICIER DECKS</span><button class="icon-button" data-action="close-shop" aria-label="Close shop">${icon('cross')}</button></div><h2 id="modal-title">New topics.<br><em>New arguments.</em></h2><p class="modal-description">One small unlock each, yours forever, on every device with your store account. Owned topics join solo runs automatically and can be toggled for party rooms.</p>
    ${PACKS.map((pack) => packRow(pack.packId, pack.title, pack.tagline, pack.productId, pack.fallbackPrice)).join('')}
    ${PACKS.every((pack) => store.owns(pack.packId)) ? '' : `<div class="pack-row pack-row-bundle"><div><strong>${BUNDLE_TITLE}</strong><span>Every current pack, one price.</span></div>${bundleAction}</div>`}
    ${footer}`;
  if (!modal.open) modal.showModal();
  if (storePending) void purchasesReady.then(() => { if (modal.open && modalKind === 'shop') showShop(); });
}
async function shopBuy(productId: string): Promise<void> {
  const granted = await purchaseManager.buy(productId);
  if (granted.length) {
    const names = granted.map((id) => PACKS.find((pack) => pack.packId === id)?.title ?? id).join(', ');
    toast(`Unlocked: ${names}. The deck just got more interesting.`);
    showShop();
  } else toast('Purchase not completed. Nothing was charged.');
}
async function shopRestore(): Promise<void> {
  const restored = await purchaseManager.restore();
  toast(restored.length ? `Restored: ${restored.map((id) => PACKS.find((pack) => pack.packId === id)?.title ?? id).join(', ')}.` : 'Nothing to restore on this store account.');
  if (modalKind === 'shop') showShop();
}
function showTutorial(): void {
  if (screen === 'game') return;
  modalKind = 'tutorial';
  el('#modal-content').innerHTML = `<div class="modal-heading"><span class="eyebrow">A LITTLE SELF DISCOVERY</span><button class="icon-button" data-action="close-tutorial" aria-label="Close tutorial">${icon('cross')}</button></div><h2 id="modal-title">Your gut.<br><em>Your call.</em></h2><p class="modal-description">Read the situation and pick a flag. No hints from us.</p><div class="tutorial-choices"><div>${icon('flag')}<strong>RED FLAG</strong><span>Swipe left / ←</span></div><div>${icon('flag')}<strong>GREEN FLAG</strong><span>Swipe right / →</span></div></div><p class="modal-description">Ten scenarios. Pick what you would actually go for. Your verdict is waiting at the end.</p><button class="primary-button" data-action="begin">LET'S PLAY ${icon('arrow')}</button><p class="modal-hint">Keyboard: ← → to choose · Esc to pause</p>`;
  if (!modal.open) modal.showModal();
}

function pause(): void {
  if (screen !== 'game' || modal.open) return;
  advanceClock(performance.now());
  if (screen !== 'game') return;
  engine.pause();
  sound.stop();
  resetSwipe();
  modalKind = 'pause';
  el('#modal-content').innerHTML = `<p class="eyebrow">TAKE YOUR TIME</p><h2 id="modal-title">A little<br><em>breathing room.</em></h2><p class="modal-description">Your timer is paused. The signs can wait.</p><button class="primary-button" data-action="resume">BACK TO IT ${icon('arrow')}</button><button class="secondary-button" data-action="restart">START A FRESH RUN ${icon('restart')}</button><button class="setting-button" data-action="haptics" aria-pressed="${preferences.haptics}"><span>Vibration <small>On supported devices</small></span><strong>${preferences.haptics ? 'ON' : 'OFF'}</strong></button><button class="text-button back-home" data-action="home">End run & return home</button>`;
  modal.showModal();
}
function resume(): void {
  if (document.hidden || !appActive) return;
  closeModal();
  lastFrame = performance.now();
  engine.resume();
}
function start(): void {
  if (document.hidden || !appActive) return;
  closeModal();
  preferences = savePreferences({ tutorialSeen: true });
  sound.stop();
  sound.unlock();
  resetSwipe();
  engine.start(purchaseManager.unlockedCategories(BASE_CATEGORIES)); // solo: base topics + every owned pack
  feedbackRemaining = 0;
  lastFrame = performance.now();
  setScreen('game');
  renderCard();
  el<HTMLButtonElement>('[data-action="pause"]').focus({ preventScroll: true });
}
function renderHud(): void {
  const state = engine.state;
  el('#solo-progress').textContent = `${state.answered} / ${state.totalRounds}`;
  el('#round-label').textContent = `SCENARIO ${Math.min(state.totalRounds, state.answered + (state.phase === 'playing' ? 1 : 0))}`;
  el('#red-picks').textContent = String(state.redPicks);
  el('#green-picks').textContent = String(state.greenPicks);
  renderTimer();
}
let displayedTenth = -1;
function renderTimer(): void {
  const { remainingMs, durationMs } = engine.state;
  if (engine.state.phase === 'playing') sound.countdown(`solo:${engine.state.answered}`, remainingMs);
  else sound.stopCountdown();
  const ratio = durationMs > 0 ? remainingMs / durationMs : 0;
  el('#timer-fill').style.transform = `scaleX(${Math.max(0, ratio)})`;
  el('#timer').classList.toggle('timer-urgent', ratio < .25);
  const tenth = Math.ceil(remainingMs / 100);
  if (tenth !== displayedTenth) {
    displayedTenth = tenth;
    el('#timer-number').textContent = tenth ? `${(tenth / 10).toFixed(1)}s` : 'Take your time';
    el('#timer').setAttribute('aria-valuenow', String(tenth / 10));
  }
}
function renderCard(): void {
  const state = engine.state;
  const scenario = state.scenario!;
  resetSwipe();
  card.classList.remove('card-picked', 'card-enter');
  void card.offsetWidth;
  card.classList.add('card-enter');
  card.classList.toggle('long-text', scenario.text.length > 110);
  card.dataset.scenarioId = scenario.id;
  el('#category').textContent = 'YOUR CALL';
  el('#difficulty').textContent = `${state.answered + 1} / ${state.totalRounds}`;
  el('#difficulty').setAttribute('aria-label', `Scenario ${state.answered + 1} of ${state.totalRounds}`);
  el('#scenario-text').textContent = scenario.text;
  el('#card-art').innerHTML = cardArt(state.answered);
  el('#pace-label').textContent = 'WHAT WOULD YOU GO FOR?';
  el('#timer').setAttribute('aria-valuemax', String(state.durationMs / 1000));
  el('#feedback').className = 'feedback';
  el('#feedback').innerHTML = '<strong>Your gut has something to say.</strong><p>Swipe the card or choose below.</p>';
  for (const button of app.querySelectorAll<HTMLButtonElement>('.choice')) button.disabled = false;
  renderHud();
  announce(`Card ${state.answered + 1}. ${scenario.text}`);
}
function showFeedback(): void {
  resetSwipe(); sound.stopCountdown();
  feedbackRemaining = 650;
  card.classList.remove('card-enter');
  card.classList.add('card-picked');
  for (const button of app.querySelectorAll<HTMLButtonElement>('.choice')) button.disabled = true;
  el('#feedback').className = 'feedback';
  el('#feedback').innerHTML = '<strong></strong><p>Your next scenario is coming up.</p>';
  el('#feedback strong').textContent = engine.state.feedback!.answer === 'green' ? 'Green flag. Noted.' : 'Red flag. Noted.';
  sound.play('pick');
  vibrate(preferences.haptics);
  renderHud();
}
function choose(answer: Answer): void {
  if (screen !== 'game' || modal.open || document.hidden || !appActive) return;
  sound.unlock();
  advanceClock(performance.now());
  if (engine.answer(answer)) showFeedback();
}
function finish(): void {
  const state = engine.state;
  const verdict = partyVerdict(state.taste);
  const chaos = tastePercent(state.taste.redAccepted, state.taste.redShown) ?? 0;
  const green = tastePercent(state.taste.greenAccepted, state.taste.greenShown) ?? 0;
  el('#results-title').textContent = verdict.title;
  el('#chaos-percent').textContent = `${chaos}%`;
  el('#green-percent').textContent = `${green}%`;
  el('#picks-made').textContent = String(state.answered);
  el('#taste-detail').textContent = `${state.taste.redAccepted} of ${state.taste.redShown} red flags accepted`;
  el('#result-message').textContent = verdict.line;
  el('#share-fallback').hidden = true;
  // A finished run is the natural breakpoint: count it for the ad schedule.
  ads?.recordGameCompleted();
  setScreen('results');
  sound.stopCountdown(); sound.play('finish');
  announce(`Your verdict: ${verdict.title}. ${chaos} percent Taste for Chaos and ${green} percent green flag appreciation.`);
  el<HTMLButtonElement>('[data-action="replay"]').focus({ preventScroll: true });
}
function advanceClock(now: number): void {
  const elapsed = Math.max(0, now - lastFrame);
  lastFrame = now;
  if (screen !== 'game' || document.hidden || !appActive) return;
  if (engine.state.phase === 'playing') {
    engine.tick(elapsed);
    renderTimer();
  } else if (engine.state.phase === 'feedback') {
    feedbackRemaining -= elapsed;
    if (feedbackRemaining <= 0) {
      engine.next();
      if (engine.state.phase as string === 'over') finish();
      else renderCard();
    }
  }
}
function frame(now: number): void { advanceClock(now); requestAnimationFrame(frame); }

async function share(): Promise<void> {
  const state = engine.state;
  const verdict = partyVerdict(state.taste);
  const text = `RED FLAG RUSH. My result: ${verdict.title}. ${tastePercent(state.taste.redAccepted, state.taste.redShown)}% Taste for Chaos, ${tastePercent(state.taste.greenAccepted, state.taste.greenShown)}% green flag appreciation. What's your type?`;
  const data = { title: 'RED FLAG RUSH. My verdict', text };
  if (navigator.share) {
    try { await navigator.share(data); return; }
    catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Result copied. Send it to your group chat.');
  } catch {
    el('#share-fallback').hidden = false;
    const textarea = el<HTMLTextAreaElement>('#share-text');
    textarea.value = text;
    textarea.focus();
    textarea.select();
    toast('Select and copy your result below.');
  }
}

app.addEventListener('click', (event) => {
  const button = (event.target as Element).closest<HTMLElement>('[data-action]');
  if (!button || button.hasAttribute('disabled')) return;
  const action = button.dataset.action;
  sound.unlock();
  switch (action) {
    case 'start': preferences.tutorialSeen ? start() : showTutorial(); break;
    case 'begin': case 'restart': start(); break;
    case 'replay': void ads?.maybeShowInterstitial(); start(); break;
    case 'red': case 'green': choose(action); break;
    case 'pause': pause(); break;
    case 'resume': resume(); break;
    case 'help': showTutorial(); break;
    case 'close-tutorial': closeModal(); preferences = savePreferences({ tutorialSeen: true }); break;
    case 'party-open': party.open(); break;
    case 'shop-open': showShop(); break;
    case 'close-shop': closeModal(); break;
    case 'buy-pack': void shopBuy(button.dataset.product!); break;
    case 'restore-purchases': void shopRestore(); break;
    case 'ad-privacy':
      void ads?.showPrivacyOptions().then((shown) => {
        el('[data-action="ad-privacy"]').hidden = !ads?.privacyOptionsRequired;
        if (!shown) toast('Privacy choices are unavailable. Please try again later.');
      });
      break;
    case 'mute': toggleSound(); break;
    case 'haptics':
      preferences = savePreferences({ haptics: !preferences.haptics });
      button.setAttribute('aria-pressed', String(preferences.haptics));
      button.querySelector('strong')!.textContent = preferences.haptics ? 'ON' : 'OFF';
      vibrate(preferences.haptics);
      break;
    case 'share': void share(); break;
    case 'home': if (screen === 'results') void ads?.maybeShowInterstitial(); closeModal(); resetSwipe(); engine.pause(); sound.stop(); setScreen('home'); el<HTMLButtonElement>('[data-action="start"]').focus(); break;
    case 'update': if (screen !== 'game') update?.(); break;
  }
});
el('.brand').addEventListener('click', (event) => { event.preventDefault(); if (screen === 'game') pause(); else { closeModal(); setScreen('home'); } });
modal.addEventListener('cancel', (event) => {
  event.preventDefault();
  if (modalKind === 'pause') resume();
  else if (modalKind === 'shop') closeModal();
  else if (modalKind === 'party') { closeModal(); party.hide(); void ads?.maybeShowInterstitial(); }
  else { closeModal(); preferences = savePreferences({ tutorialSeen: true }); }
});
document.addEventListener('keydown', (event) => {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || (event.target as HTMLElement).matches('textarea,input,select')) return;
  if (event.key === 'Escape' && !modal.open && screen === 'game') { event.preventDefault(); pause(); return; }
  if (modal.open) return;
  if (screen === 'game' && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    event.preventDefault(); choose(event.key === 'ArrowLeft' ? 'red' : 'green');
  } else if ((event.key === ' ' || event.key === 'Enter') && !(event.target as HTMLElement).closest('button,a')) {
    event.preventDefault();
    if (screen === 'home') preferences.tutorialSeen ? start() : showTutorial();
    else if (screen === 'results') { void ads?.maybeShowInterstitial(); start(); }
  }
});
document.addEventListener('visibilitychange', () => { sound.setActive(!document.hidden && appActive); if (document.hidden) pause(); else lastFrame = performance.now(); });
window.addEventListener('pagehide', () => { sound.setActive(false); if (screen === 'game') pause(); });
window.addEventListener('pageshow', () => sound.setActive(!document.hidden && appActive));
void setupNativeLifecycle({
  onActiveChange(active) {
    if (!active) pause();
    appActive = active;
    sound.setActive(active && !document.hidden);
    lastFrame = performance.now();
    // Returning to the app leaves the pause menu open until the player resumes.
  },
  onBackButton() {
    if (modalKind === 'pause') resume();
    else if (modalKind === 'shop') closeModal();
    else if (modalKind === 'tutorial') {
      closeModal();
      preferences = savePreferences({ tutorialSeen: true });
    } else if (modalKind === 'party') {
      closeModal();
      party.hide();
      void ads?.maybeShowInterstitial();
    } else if (screen === 'game') pause();
    else if (screen === 'results') {
      setScreen('home');
      el<HTMLButtonElement>('[data-action="start"]').focus();
    } else void minimizeNativeApp();
  },
});
refreshSound();
setScreen('home');
if (isNativePlatform()) el('#offline-status').textContent = 'READY TO PLAY OFFLINE';
setupPwa((apply) => { update = apply; el('#update-banner').hidden = screen === 'game'; }, () => { el('#offline-status').textContent = 'READY FOR YOUR NEXT OFFLINE RUN'; });
requestAnimationFrame(frame);
