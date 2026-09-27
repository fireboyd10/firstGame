import { cardArt, icon } from '../art';
import type { Sound } from '../audio/sound';
import { partyVerdict, type PartyTaste } from './personality';
import { detectPartyBaseUrl, enterParty, getPartyRoomState, normalizePartyUrl, partyAction, PartyRequestError, type PartyRoomState, type PartySession } from './party';

const escape = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const key = 'red-flag-rush.party-session.v2';

export function createPartyUi(root: HTMLElement, hooks: { onOpen: () => void; onClose: () => void; sound: Sound; onMute: () => void }) {
  let session: PartySession | null = null;
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (saved && /^[A-Z2-9]{6}$/.test(saved.code) && /^[A-Za-z0-9_-]{43}$/.test(saved.token)) {
      session = { ...saved, baseUrl: normalizePartyUrl(saved.baseUrl) };
    }
  } catch { /* A room still works when session storage is unavailable. */ }
  let state: PartyRoomState | null = null;
  let opened = false;
  let busy = false;
  let polling = false;
  let revision = 0;
  let interval = 0;
  let clockInterval = 0;
  let clockOffset = 0;
  let error = '';
  let lastRender = '';
  let lastView = '';

  const save = () => { try { if (session) sessionStorage.setItem(key, JSON.stringify(session)); else sessionStorage.removeItem(key); } catch { /* Keep in memory. */ } };
  const input = (id: string) => root.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)?.value.trim() || '';
  const button = (action: string, label: string, disabled = false, secondary = false) => `<button class="${secondary ? 'secondary' : 'primary'}-button" data-party-action="${action}" ${busy || disabled ? 'disabled' : ''}>${label}</button>`;
  const lengths = (value: number) => `<label class="field-label" for="party-length">How many scenarios?</label><select class="party-input" id="party-length" ${busy ? 'disabled' : ''}>${[5, 10, 15].map((count) => `<option value="${count}" ${count === value ? 'selected' : ''}>${count} scenarios</option>`).join('')}</select>`;
  const heading = (label: string) => `<div class="modal-heading"><span class="eyebrow">${label}</span><div class="party-dialog-actions"><button class="icon-button" data-party-action="mute" aria-label="${hooks.sound.muted ? 'Unmute' : 'Mute'} sound" aria-pressed="${hooks.sound.muted}">${icon(hooks.sound.muted ? 'mute' : 'sound')}</button><button class="icon-button" data-party-action="close" aria-label="Close party">${icon('cross')}</button></div></div>`;
  function displayError() {
    const target = root.querySelector<HTMLElement>('#party-error');
    if (target) { target.textContent = error; target.hidden = !error; }
  }
  function tick() {
    const target = root.querySelector<HTMLElement>('#party-countdown');
    if (!target || !state?.deadline) { hooks.sound.stopCountdown(); return; }
    const remaining = Math.max(0, state.deadline - (Date.now() + clockOffset));
    const seconds = Math.ceil(remaining / 1000);
    target.textContent = seconds ? `Voting time: ${seconds}s` : 'Take your time. Waiting for every vote.';
    if (!error && !state.players.find((player) => player.id === session?.playerId)?.answered) hooks.sound.countdown(`party:${state.code}:${state.round}`, remaining);
    else hooks.sound.stopCountdown();
  }
  function render(force = false) {
    if (!opened) return;
    const signature = JSON.stringify({ session: session?.code, state: state ? { ...state, serverNow: 0 } : null, busy });
    if (!force && lastRender === signature) { displayError(); tick(); return; }
    lastRender = signature;
    const focused = (document.activeElement as HTMLElement | null)?.dataset.partyAction;
    let html = heading(state ? `ROOM ${escape(state.code)}` : 'THE GROUP CHAT, IN PERSON');
    if (!session) {
      html += `<h2 id="modal-title">Red flag,<br><em>but I like it.</em></h2><p class="modal-description">Bring your friends. Pick your flags. Prepare to explain yourself.</p>
        <label class="field-label" for="party-name">Your name</label><input class="party-input" id="party-name" maxlength="24" autocomplete="nickname" placeholder="What should we call you?">
        ${lengths(10)}<label class="field-label" for="party-theme">Your crowd</label><select class="party-input" id="party-theme"><option value="everyone">The whole group</option><option value="girls">Girls' night</option><option value="boys">Boys' night</option></select>
        ${button('create', 'CREATE A ROOM')}
        <div class="party-divider">Joining your friends?</div><label class="field-label" for="party-code">Room code</label><div class="party-inline"><input class="party-input party-code-input" id="party-code" maxlength="6" autocomplete="off" autocapitalize="characters" placeholder="ABCDEF">${button('join', 'JOIN', false, true)}</div>
        <details class="party-connection" ${!detectPartyBaseUrl() ? 'open' : ''}><summary>Wi-Fi connection</summary><p>Open the same game address on every phone. The room code works at that address.</p><label class="field-label" for="party-server">Party server address</label><input class="party-input" id="party-server" type="url" value="${escape(detectPartyBaseUrl())}" placeholder="http://192.168.1.20:3000"><p>On your computer, run <code>npm.cmd run party</code> and keep the terminal open. Use the Same Wi-Fi address it prints.</p></details>`;
    } else if (!state) {
      html += `<h2 id="modal-title">Getting everyone together.</h2><p class="modal-description">Reconnecting to room ${escape(session.code)}.</p>${button('refresh', 'TRY AGAIN')}${button('leave', 'LEAVE ROOM', false, true)}`;
    } else {
      const host = state.hostId === session.playerId;
      const me = state.players.find((player) => player.id === session!.playerId);
      const names = (answer: string) => (state!.results || []).filter((vote) => vote.answer === answer).map((vote) => escape(state!.players.find((player) => player.id === vote.playerId)?.name)).join(', ');
      if (state.phase === 'lobby') {
        const vibe = state.theme === 'girls' ? "Girls' night is on." : state.theme === 'boys' ? "Boys' night is on." : 'Everyone in?';
        html += `<div id="party-lobby"><h2 id="modal-title">${vibe}</h2><p class="modal-description">Same Wi-Fi. Same game address. Share this code:</p><strong class="party-room-code">${escape(state.code)}</strong><p class="party-address">${escape(session.joinUrl || session.baseUrl)}</p><ul class="party-player-list">${state.players.map((player) => `<li class="party-player"><span>${escape(player.name)}${player.id === session!.playerId ? ' (you)' : ''}</span><small>${player.id === state!.hostId ? 'Host' : player.connected ? 'Ready' : 'Reconnecting'}</small></li>`).join('')}</ul>
          ${host ? lengths(state.totalRounds) + button('start', 'EVERYONE IN? LET\'S GO', state.players.length < 2) : `<p class="modal-description">${state.totalRounds} scenarios. Waiting for the host to start.</p>`}</div>`;
      } else if (state.phase === 'question') {
        html += `<div id="party-question"><p class="eyebrow">SCENARIO ${state.round} OF ${state.totalRounds}</p><h2 id="modal-title" class="sr-only">Make your call</h2><div class="party-scenario">${cardArt(state.round)}<p>${escape(state.scenario?.text)}</p></div><p id="party-countdown" class="party-countdown" role="timer" aria-live="off"></p><div class="party-vote-row">${button('red', '🚩 RED FLAG', me?.answered, true)}${button('green', '💚 GREEN FLAG', me?.answered, true)}</div><p id="party-status" class="modal-description" role="status">${me?.answered ? 'Your vote is in. Keep a straight face.' : 'Go with your own take. Nobody sees it yet.'}</p><p class="modal-hint">${state.players.filter((player) => player.answered).length} of ${state.players.length} votes in</p></div>`;
      } else if (state.phase === 'reveal') {
        const green = state.results?.filter((vote) => vote.answer === 'green').length || 0;
        const red = state.results?.filter((vote) => vote.answer === 'red').length || 0;
        html += `<div id="party-reveal"><p class="eyebrow">SCENARIO ${state.round} OF ${state.totalRounds}</p><h2 id="modal-title">${green && red ? 'We need to talk.' : 'Well, you all agree.'}</h2><p class="party-recap">${escape(state.scenario?.text)}</p><div class="party-vote-split"><div><strong>💚 ${green} Green ${green === 1 ? 'Flag' : 'Flags'}</strong><p>${names('green') || 'Nobody'}</p></div><div><strong>🚩 ${red} Red ${red === 1 ? 'Flag' : 'Flags'}</strong><p>${names('red') || 'Nobody'}</p></div></div><p class="party-discussion">${escape(state.discussion)}</p><p class="modal-description">${host ? 'Let everyone plead their case. Move on when you are ready.' : 'Talk it out. The host will move on when everyone is ready.'}</p>${host ? button('next', state.round === state.totalRounds ? 'SHOW OUR TASTE' : 'NEXT SCENARIO') : ''}</div>`;
      } else {
        const ranked = [...state.players].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
        const lowest = Math.min(...ranked.map((player) => player.tolerance ?? 0));
        html += `<div id="party-results"><p class="eyebrow">THE GROUP CHAT HAS RECEIPTS</p><h2 id="modal-title">A taste for chaos.</h2><p class="modal-description">Your choices in a game. Your friends can take it from here.</p><ol class="party-ranking">${ranked.map((player) => {
          const verdict = partyVerdict(player as PartyTaste);
          const top = player.rank === 1 && (player.tolerance ?? 0) > 0;
          const badge = top ? ((state!.winnerIds?.length ?? 0) > 1 ? 'Tied for most chaotic' : 'Most chaotic') : player.tolerance === lowest ? 'Green-flag guardian' : '';
          return `<li class="party-result ${player.id === session!.playerId ? 'party-result-you' : ''}"><div class="party-result-heading"><strong>#${player.rank} ${escape(player.name)}${player.id === session!.playerId ? ' (you)' : ''}</strong><span>${badge}</span></div><h3>${verdict.title}</h3><p>${verdict.line}</p><div class="party-metrics"><div><strong>${player.tolerance}%</strong><span>Taste for Chaos</span><small>${player.redAccepted} of ${player.redShown} red flags accepted</small></div><div><strong>${player.appreciation}%</strong><span>Green flag appreciation</span><small>${player.greenAccepted} of ${player.greenShown} green flags accepted</small></div></div></li>`;
        }).join('')}</ol><details class="party-connection"><summary>How the percentages work</summary><p>Taste for Chaos is the share of this deck's red flags you called green. Green flag appreciation counts the green flags you called green. Ties share a rank. These are our takes on the situations, and context can change yours.</p></details>${host ? button('replay', 'ANOTHER ROUND WITH THIS GROUP') : '<p class="modal-description">The host can bring everyone back to the lobby.</p>'}</div>`;
      }
      if (host && state.phase !== 'finished') {
        html += state.players.filter((player) => !player.connected && player.id !== session!.playerId).map((player) => `<div class="party-disconnected">${escape(player.name)} is disconnected. They can reopen the room.<button class="text-button" data-party-action="remove" data-player="${escape(player.id)}">Remove from game</button></div>`).join('');
      }
      html += button('leave', 'LEAVE ROOM', false, true);
    }
    html += '<p id="party-error" class="party-error" role="alert" hidden></p>';
    root.innerHTML = html;
    displayError(); tick();
    const view = `${session?.code || 'setup'}:${state?.phase || 'loading'}:${state?.round || 0}`;
    if (view !== lastView) {
      root.closest('dialog')?.scrollTo(0, 0);
      const title = root.querySelector<HTMLElement>('#modal-title');
      if (title) { title.tabIndex = -1; title.focus({ preventScroll: true }); }
      lastView = view;
    } else if (focused) root.querySelector<HTMLButtonElement>(`[data-party-action="${focused}"]`)?.focus({ preventScroll: true });
  }
  function accept(value: PartyRoomState) {
    const previous = state?.phase;
    state = value; clockOffset = value.serverNow - Date.now(); error = ''; render();
    if (opened && previous === 'question' && value.phase === 'reveal') hooks.sound.play('reveal');
    if (opened && previous === 'reveal' && value.phase === 'finished') hooks.sound.play('finish');
  }
  function failed(cause: unknown) {
    error = cause instanceof Error ? cause.message : 'Could not reach the room. Try again.';
    if (cause instanceof PartyRequestError && [401, 404].includes(cause.status)) { session = null; state = null; save(); render(true); }
    displayError();
  }
  async function refresh() {
    if (!session || polling || busy || !opened) return;
    const current = session; const version = revision;
    polling = true;
    try { const value = await getPartyRoomState(current); if (current === session && version === revision) accept(value); }
    catch (cause) { if (current === session && version === revision) failed(cause); }
    finally { polling = false; }
  }
  async function act(action: string, target: HTMLElement) {
    hooks.sound.unlock();
    if (action === 'close') { hooks.onClose(); return; }
    if (action === 'mute') { hooks.onMute(); render(true); return; }
    if (busy) return;
    if (action === 'refresh') { await refresh(); return; }
    // Read inputs before disabling controls. A failed request preserves the form.
    const name = input('party-name'); const code = input('party-code').toUpperCase();
    const length = Number(input('party-length')) || state?.totalRounds || 10;
    const theme = input('party-theme') || 'everyone';
    const address = input('party-server');
    error = ''; busy = true; revision++;
    for (const control of root.querySelectorAll<HTMLButtonElement>('[data-party-action]')) if (control.dataset.partyAction !== 'close') control.disabled = true;
    try {
      if (action === 'create' || action === 'join') {
        if (!name) throw new Error('What should we call you? Add your name first.');
        if (action === 'join' && !/^[A-Z2-9]{6}$/.test(code)) throw new Error('Enter the six-character room code.');
        session = await enterParty(normalizePartyUrl(address), name, action === 'join' ? code : undefined, length, theme);
        save(); state = null;
        accept(await getPartyRoomState(session));
      } else if (session) {
        if (action === 'leave') {
          try { await partyAction(session, 'leave'); } catch { /* Leaving locally always works; server sessions expire. */ }
          session = null; state = null; save();
        } else {
          if (action === 'start' && state?.totalRounds !== length) await partyAction(session, 'settings', { totalRounds: length });
          const value = await partyAction(session, action === 'red' || action === 'green' ? 'answer' : action,
            action === 'red' || action === 'green' ? { answer: action, round: state?.round } : action === 'settings' ? { totalRounds: length } : action === 'remove' ? { playerId: target.dataset.player } : {});
          accept(value);
          if ((action === 'red' || action === 'green') && value.phase === 'question') hooks.sound.play('pick');
        }
      }
    } catch (cause) { failed(cause); }
    finally {
      busy = false;
      if (!session && error) { for (const control of root.querySelectorAll<HTMLButtonElement>('[data-party-action]')) control.disabled = false; displayError(); }
      else render(true);
    }
  }
  root.addEventListener('click', (event) => {
    const target = (event.target as Element).closest<HTMLElement>('[data-party-action]');
    if (target && !target.hasAttribute('disabled')) void act(target.dataset.partyAction!, target);
  });
  root.addEventListener('change', (event) => {
    if ((event.target as HTMLElement).id === 'party-length' && session && state?.phase === 'lobby') void act('settings', event.target as HTMLElement);
  });
  return {
    open() { opened = true; render(true); hooks.onOpen(); void refresh(); window.clearInterval(interval); window.clearInterval(clockInterval); interval = window.setInterval(() => void refresh(), 1000); clockInterval = window.setInterval(tick, 250); },
    hide() { opened = false; hooks.sound.stop(); window.clearInterval(interval); window.clearInterval(clockInterval); },
  };
}
