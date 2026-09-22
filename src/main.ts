import './styles.css';
import { GameEngine } from './game/engine';
import type { Answer } from './game/types';
import { loadPreferences, savePreferences, loadHighScore, saveHighScore } from './game/storage';
import { multiplierForStreak } from './game/scoring';
import { Sound, vibrate } from './audio/sound';
import { heroArt, cardArt, icon } from './art';
import { bindSwipe } from './swipe';
import { setupPwa } from './pwa';

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
            <p class="eyebrow"><span class="live-dot"></span> A GAME OF GOOD INSTINCTS</p>
            <h1 id="home-title">RED FLAG<span>RUSH<span class="title-spark">✳</span></span></h1>
            <p class="subtitle">SWIPE THE SIGNS</p>
          </div>
          <div class="home-art">${heroArt()}<span class="art-caption">THE SIGNS ARE THERE. CAN YOU SPOT THEM?</span></div>
          <div class="home-actions">
            <p class="home-description">A little charm. A little chaos.<br>Trust your gut before the clock runs out.</p>
            <div class="rules-strip"><span>${icon('heart')} 3 lives</span><i></i><span>5 seconds</span><i></i><span>Your call.</span></div>
            <button class="primary-button start-button" data-action="start">LET’S PLAY ${icon('arrow')}</button>
            <p class="home-best">${icon('trophy')} PERSONAL BEST <strong id="home-best">0</strong></p>
          </div>
        </div>
        <div class="home-bottom"><span>READ THE ROOM.</span><span>TRUST YOUR INSTINCTS.</span><span>CHASE THE STREAK.</span></div>
      </section>
      <section id="game" class="game view" aria-label="Current run" hidden>
        <div class="game-hud">
          <div><span class="tiny-label">SCORE</span><strong id="score">0</strong></div>
          <div class="run-label"><span class="tiny-label">READ THE ROOM</span><span id="round-label">CARD 01</span></div>
          <div class="lives" id="lives" role="img" aria-label="3 lives remaining"></div>
        </div>
        <div class="timer-label"><span id="pace-label">WARMING UP</span><span id="timer-number" aria-hidden="true">5.0s</span></div>
        <div class="timer-track" id="timer" role="progressbar" aria-label="Time remaining" aria-valuemin="0" aria-valuemax="5" aria-valuenow="5"><div id="timer-fill"></div></div>
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
        <div class="streak-bar"><span>${icon('spark')} <strong id="streak">0</strong> STREAK</span><span id="multiplier">×1 MULTIPLIER</span></div>
      </section>
      <section id="results" class="results view" aria-labelledby="results-title" hidden>
        <div class="result-burst" aria-hidden="true">${icon('spark')}${icon('heart')}${icon('spark')}</div>
        <p class="eyebrow" id="result-eyebrow">THAT’S A WRAP</p><h2 id="results-title">Good instincts.<br><em>Next-level potential.</em></h2>
        <div class="score-medallion"><span class="tiny-label">YOUR SCORE</span><strong id="final-score">0</strong><span id="record-label">KEEP READING THE SIGNS</span></div>
        <div class="result-stats"><div><strong id="best-streak">0</strong><span>BEST STREAK</span></div><div><strong id="accuracy">0%</strong><span>ACCURACY</span></div><div><strong id="high-score">0</strong><span>HIGH SCORE</span></div></div>
        <p class="result-message" id="result-message"></p>
        <button class="primary-button" data-action="replay">ONE MORE RUN ${icon('restart')}</button>
        <button class="secondary-button" data-action="share">SHARE MY SCORE ${icon('share')}</button>
        <div id="share-fallback" hidden><label for="share-text">Copy your result:</label><textarea id="share-text" readonly rows="3"></textarea></div>
        <button class="text-button back-home" data-action="home">Back to the start</button>
      </section>
    </main>
    <div class="update-banner" id="update-banner" hidden><span>A fresh version is ready.</span><button data-action="update">Update & reload ${icon('arrow')}</button></div>
    <footer class="footer"><span>Entertainment and reflection only — not clinical advice.</span><span class="offline-label" id="offline-status">NO ACCOUNTS. JUST INSTINCTS.</span></footer>
    <p id="announcement" class="sr-only" role="status" aria-live="polite"></p>
    <dialog id="modal" aria-labelledby="modal-title"><div id="modal-content"></div></dialog>
    <div class="toast" id="toast" role="status" hidden></div>
  </div>`;

function el<T extends HTMLElement = HTMLElement>(selector: string): T { return app.querySelector<T>(selector)!; }
const engine = new GameEngine();
const sound = new Sound();
let preferences = loadPreferences();
let highScore = loadHighScore();
let previousBest = highScore;
let screen: 'home' | 'game' | 'results' = 'home';
let feedbackRemaining = 0;
let lastFrame = performance.now();
let modalKind: 'tutorial' | 'pause' | null = null;
let update: (() => void) | null = null;
let toastTimeout = 0;
const modal = el<HTMLDialogElement>('#modal');
const card = el('#scenario-card');
const resetSwipe = bindSwipe(card, () => screen === 'game' && engine.state.phase === 'playing' && !modal.open, choose);

function setScreen(next: typeof screen): void {
  screen = next;
  for (const name of ['home', 'game', 'results']) el(`#${name}`).hidden = name !== next;
  el('[data-action="pause"]').hidden = next !== 'game';
  el('[data-action="restart"]').hidden = next !== 'game';
  el('[data-action="help"]').hidden = next === 'game';
  el('#update-banner').hidden = !update || next === 'game';
  el('#home-best').textContent = highScore.toLocaleString();
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
function closeModal(): void { modal.close(); modalKind = null; }
function showTutorial(): void {
  if (screen === 'game') return;
  modalKind = 'tutorial';
  el('#modal-content').innerHTML = `<div class="modal-heading"><span class="eyebrow">THE 20-SECOND BRIEF</span><button class="icon-button" data-action="close-tutorial" aria-label="Close tutorial">${icon('cross')}</button></div><h2 id="modal-title">Read it.<br>Feel it. <em>Flag it.</em></h2><p class="modal-description">Dating, friendship, and everything in between. Spot the behavior. Make your call.</p><div class="tutorial-choices"><div>${icon('flag')}<strong>RED FLAG</strong><span>Swipe left / ←</span><small>Disrespect, pressure,<br>or control.</small></div><div>${icon('flag')}<strong>GREEN FLAG</strong><span>Swipe right / →</span><small>Respect, honesty,<br>and healthy boundaries.</small></div></div><ul class="tutorial-rules"><li>${icon('heart')} <span><strong>Three lives. Make them count.</strong> A wrong answer or timeout costs one.</span></li><li>${icon('spark')} <span><strong>Find your flow.</strong> A streak of 5 boosts your multiplier. The pace picks up as you go.</span></li><li>${icon('pause')} <span><strong>Take a breath.</strong> Pause whenever you need. Buttons work just like swipes.</span></li></ul><button class="primary-button" data-action="begin">GOT IT. LET’S GO. ${icon('arrow')}</button><p class="modal-hint">Keyboard: ← → to choose · Esc to pause</p>`;
  if (!modal.open) modal.showModal();
}
function pause(): void {
  if (screen !== 'game' || modal.open) return;
  advanceClock(performance.now());
  if (screen !== 'game') return;
  engine.pause();
  resetSwipe();
  modalKind = 'pause';
  el('#modal-content').innerHTML = `<p class="eyebrow">TAKE YOUR TIME</p><h2 id="modal-title">A little<br><em>breathing room.</em></h2><p class="modal-description">Your timer is paused. The signs can wait.</p><button class="primary-button" data-action="resume">BACK TO IT ${icon('arrow')}</button><button class="secondary-button" data-action="restart">START A FRESH RUN ${icon('restart')}</button><button class="setting-button" data-action="haptics" aria-pressed="${preferences.haptics}"><span>Vibration <small>On supported devices</small></span><strong>${preferences.haptics ? 'ON' : 'OFF'}</strong></button><button class="text-button back-home" data-action="home">End run & return home</button>`;
  modal.showModal();
}
function resume(): void {
  if (document.hidden) return;
  closeModal();
  lastFrame = performance.now();
  engine.resume();
}
function start(): void {
  if (document.hidden) return;
  closeModal();
  preferences = savePreferences({ tutorialSeen: true });
  previousBest = highScore;
  sound.unlock();
  resetSwipe();
  engine.start();
  feedbackRemaining = 0;
  lastFrame = performance.now();
  setScreen('game');
  renderCard();
  el<HTMLButtonElement>('[data-action="pause"]').focus({ preventScroll: true });
}
function renderHud(): void {
  const state = engine.state;
  el('#score').textContent = state.score.toLocaleString();
  el('#lives').innerHTML = Array.from({ length: 3 }, (_, i) => icon('heart', i < state.lives ? 'life-full' : 'life-lost')).join('');
  el('#lives').setAttribute('aria-label', `${state.lives} lives remaining`);
  el('#round-label').textContent = `CARD ${String(state.answered + (state.phase === 'playing' ? 1 : 0)).padStart(2, '0')}`;
  el('#streak').textContent = String(state.streak);
  el('#multiplier').textContent = `×${multiplierForStreak(state.streak)} MULTIPLIER`;
  el('.streak-bar').classList.toggle('on-fire', state.streak >= 5);
  renderTimer();
}
let displayedTenth = -1;
function renderTimer(): void {
  const { remainingMs, durationMs } = engine.state;
  const ratio = durationMs > 0 ? remainingMs / durationMs : 0;
  el('#timer-fill').style.transform = `scaleX(${Math.max(0, ratio)})`;
  el('#timer').classList.toggle('timer-urgent', ratio < .25);
  const tenth = Math.ceil(remainingMs / 100);
  if (tenth !== displayedTenth) {
    displayedTenth = tenth;
    el('#timer-number').textContent = `${(tenth / 10).toFixed(1)}s`;
    el('#timer').setAttribute('aria-valuenow', String(tenth / 10));
  }
}
function renderCard(): void {
  const state = engine.state;
  const scenario = state.scenario!;
  resetSwipe();
  card.classList.remove('is-correct', 'is-incorrect', 'card-enter');
  void card.offsetWidth;
  card.classList.add('card-enter');
  card.classList.toggle('long-text', scenario.text.length > 110);
  card.dataset.scenarioId = scenario.id;
  el('#category').textContent = scenario.category;
  el('#difficulty').textContent = `${'●'.repeat(scenario.difficulty)}${'○'.repeat(3 - scenario.difficulty)}`;
  el('#difficulty').setAttribute('aria-label', `Difficulty ${scenario.difficulty} of 3`);
  el('#scenario-text').textContent = scenario.text;
  el('#card-art').innerHTML = cardArt(state.answered);
  el('#pace-label').textContent = state.answered < 6 ? 'WARMING UP' : state.answered < 14 ? 'FINDING YOUR FLOW' : 'TRUST THAT GUT';
  el('#timer').setAttribute('aria-valuemax', String(state.durationMs / 1000));
  el('#feedback').className = 'feedback';
  el('#feedback').innerHTML = '<strong>Your gut has something to say.</strong><p>Swipe the card or choose below.</p>';
  for (const button of app.querySelectorAll<HTMLButtonElement>('.choice')) button.disabled = false;
  renderHud();
  announce(`Card ${state.answered + 1}. ${scenario.text}`);
}
function showFeedback(): void {
  const state = engine.state;
  const feedback = state.feedback!;
  resetSwipe();
  feedbackRemaining = 2200;
  card.classList.remove('card-enter');
  card.classList.add(feedback.correct ? 'is-correct' : 'is-incorrect');
  for (const button of app.querySelectorAll<HTMLButtonElement>('.choice')) button.disabled = true;
  const title = feedback.correct ? `Good call. +${feedback.points}` : feedback.answer === null ? 'Time’s up.' : 'A sign worth noticing.';
  el('#feedback').className = `feedback ${feedback.correct ? 'feedback-correct' : 'feedback-incorrect'}`;
  el('#feedback').innerHTML = `<strong>${icon(feedback.correct ? 'check' : 'cross')} ${title}<span>${state.scenario!.answer.toUpperCase()} FLAG</span></strong><p></p>`;
  el('#feedback p').textContent = feedback.explanation;
  highScore = saveHighScore(state.score);
  sound.play(feedback.correct ? state.streak % 5 === 0 ? 'streak' : 'correct' : 'incorrect');
  vibrate(preferences.haptics, feedback.correct);
  renderHud();
}
function choose(answer: Answer): void {
  if (screen !== 'game' || modal.open || document.hidden) return;
  sound.unlock();
  advanceClock(performance.now());
  if (engine.answer(answer)) showFeedback();
}
function finish(): void {
  highScore = saveHighScore(engine.state.score);
  const state = engine.state;
  const accuracy = state.answered ? Math.round(state.correct / state.answered * 100) : 0;
  const record = state.score > previousBest;
  el('#final-score').textContent = state.score.toLocaleString();
  el('#best-streak').textContent = String(state.bestStreak);
  el('#accuracy').textContent = `${accuracy}%`;
  el('#high-score').textContent = highScore.toLocaleString();
  el('#record-label').textContent = record ? '✦ NEW PERSONAL BEST ✦' : 'EVERY RUN IS A FRESH READ';
  el('#result-eyebrow').textContent = record ? 'LOOK AT YOU, READING THE ROOM' : 'THAT’S A WRAP';
  el('#result-message').textContent = `${state.correct} of ${state.answered} signs spotted. ${accuracy >= 75 ? 'Your instincts are on a roll.' : 'Every sign is a chance to learn.'}`;
  el('#share-fallback').hidden = true;
  setScreen('results');
  sound.play('over');
  announce(`Run complete. ${state.score} points. ${accuracy} percent accuracy. Best streak ${state.bestStreak}.`);
  el<HTMLButtonElement>('[data-action="replay"]').focus({ preventScroll: true });
}
function advanceClock(now: number): void {
  const elapsed = Math.max(0, now - lastFrame);
  lastFrame = now;
  if (screen !== 'game' || document.hidden) return;
  if (engine.state.phase === 'playing') {
    engine.tick(elapsed);
    if (engine.state.phase as string === 'feedback') showFeedback();
    else renderTimer();
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
  const text = `RED FLAG RUSH — I scored ${state.score} with a best streak of ${state.bestStreak}! ${state.answered ? Math.round(state.correct / state.answered * 100) : 0}% accuracy. Can you read the room?`;
  const data = { title: 'RED FLAG RUSH · Swipe the Signs', text };
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
    case 'begin': case 'replay': case 'restart': start(); break;
    case 'red': case 'green': choose(action); break;
    case 'pause': pause(); break;
    case 'resume': resume(); break;
    case 'help': showTutorial(); break;
    case 'close-tutorial': closeModal(); preferences = savePreferences({ tutorialSeen: true }); break;
    case 'mute': preferences = savePreferences({ muted: !preferences.muted }); refreshSound(); sound.unlock(); break;
    case 'haptics':
      preferences = savePreferences({ haptics: !preferences.haptics });
      button.setAttribute('aria-pressed', String(preferences.haptics));
      button.querySelector('strong')!.textContent = preferences.haptics ? 'ON' : 'OFF';
      vibrate(preferences.haptics, true);
      break;
    case 'share': void share(); break;
    case 'home': closeModal(); resetSwipe(); engine.pause(); highScore = saveHighScore(engine.state.score); setScreen('home'); el<HTMLButtonElement>('[data-action="start"]').focus(); break;
    case 'update': if (screen !== 'game') update?.(); break;
  }
});
el('.brand').addEventListener('click', (event) => { event.preventDefault(); if (screen === 'game') pause(); else { closeModal(); setScreen('home'); } });
modal.addEventListener('cancel', (event) => {
  event.preventDefault();
  if (modalKind === 'pause') resume();
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
    else if (screen === 'results') start();
  }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else lastFrame = performance.now(); });
window.addEventListener('pagehide', () => { if (screen === 'game') pause(); });
refreshSound();
setScreen('home');
setupPwa((apply) => { update = apply; el('#update-banner').hidden = screen === 'game'; }, () => { el('#offline-status').textContent = 'READY FOR YOUR NEXT OFFLINE RUN'; });
requestAnimationFrame(frame);
if (!preferences.tutorialSeen) showTutorial();
