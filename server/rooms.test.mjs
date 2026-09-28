import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomService, RateLimiter } from './rooms.mjs';

const cards = Array.from({ length: 32 }, (_, index) => ({ id: String(index), text: `Dating situation ${index}`, answer: index % 2 ? 'green' : 'red', category: index % 4 < 2 ? 'Base' : 'Other', difficulty: 2, discussion: 'Would you go on another date?' }));
function fixture(totalRounds = 5, names = ['Ada', 'Bea']) {
  let clock = 1000;
  const service = new RoomService(cards, { now: () => clock, random: (max) => max - 1 });
  const host = service.create({ name: names[0], totalRounds });
  const players = [host, ...names.slice(1).map((name) => service.join(host.code, { name }))];
  const action = (player, name, body = {}) => service.action(host.code, player.token, name, body);
  const state = (player = host) => service.state(host.code, player.token);
  return { service, host, players, action, state, advance(ms) { clock += ms; } };
}

test('the final vote immediately ends the timer and reveals votes without starting the next scenario', () => {
  const f = fixture();
  f.action(f.host, 'start');
  f.action(f.host, 'answer', { answer: 'green', round: 1 });
  const hidden = f.state();
  assert.equal(hidden.phase, 'question');
  assert.equal(hidden.results, undefined);
  assert.equal(hidden.scenario.answer, undefined);
  assert.equal(hidden.players[0].redAccepted, undefined);
  assert.equal(hidden.players[0].tolerance, undefined);
  assert.equal(hidden.players[0].score, undefined);
  assert.equal(hidden.deadline - hidden.serverNow, 30000);
  assert.throws(() => f.action(f.host, 'next'), { status: 409 });
  const revealed = f.action(f.players[1], 'answer', { answer: 'green', round: 1 });
  assert.equal(revealed.phase, 'reveal');
  assert.equal(revealed.deadline, null);
  assert.equal(revealed.serverNow, hidden.serverNow);
  assert.equal(revealed.round, 1);
  assert.equal(revealed.canAdvance, false);
  assert.equal(f.state().canAdvance, true);
  assert.deepEqual(f.state().results.map((item) => item.answer), ['green', 'green']);
  assert.equal(f.state().scenario.answer, undefined);
});

test('unanswered players get extra time and revealed results wait for the host', () => {
  const f = fixture(); f.action(f.host, 'start');
  f.action(f.host, 'answer', { answer: 'red', round: 1 });
  f.advance(90000);
  assert.equal(f.state().phase, 'question');
  f.action(f.players[1], 'answer', { answer: 'green', round: 1 });
  assert.equal(f.state().phase, 'reveal');
  f.advance(600000);
  assert.equal(f.state().phase, 'reveal');
  assert.equal(f.state().round, 1);
  assert.equal(f.action(f.host, 'next').round, 2);
});

test('only the host can choose 5, 10, or 15 scenarios and advance rounds', () => {
  const f = fixture();
  assert.throws(() => f.action(f.players[1], 'settings', { totalRounds: 15 }), { status: 403 });
  assert.throws(() => f.action(f.host, 'settings', { totalRounds: 7 }), { status: 400 });
  assert.equal(f.action(f.host, 'settings', { totalRounds: 15 }).totalRounds, 15);
  assert.throws(() => f.action(f.players[1], 'start'), { status: 403 });
  f.action(f.host, 'start');
  assert.throws(() => f.action(f.host, 'settings', { totalRounds: 5 }), { status: 409 });
});

for (const length of [5, 10, 15]) test(`${length} rounds use unique mixed cards and percentages, with fair ties`, () => {
  const f = fixture(length, ['Ada', 'Bea', 'Cleo', 'Dani']);
  f.action(f.host, 'start');
  const deck = f.service.rooms.get(f.host.code).deck;
  assert.equal(new Set(deck.map((card) => card.id)).size, length);
  for (let round = 1; round <= length; round++) {
    const classification = deck[round - 1].answer;
    for (const [index, player] of f.players.entries()) {
      f.action(player, 'answer', { answer: index === 1 ? 'red' : index === 2 ? classification : 'green', round });
    }
    f.advance(30000);
    assert.equal(f.state().phase, 'reveal');
    f.action(f.host, 'next');
  }
  const result = f.state();
  assert.equal(result.phase, 'finished');
  assert.deepEqual(result.players.map((player) => player.tolerance), [100, 0, 0, 100]);
  assert.deepEqual(result.players.map((player) => player.appreciation), [100, 0, 100, 100]);
  assert.deepEqual(result.players.map((player) => player.rank), [1, 3, 3, 1]);
  assert.deepEqual(result.winnerIds, [f.players[0].playerId, f.players[3].playerId]);
  assert.equal(result.players[0].redShown, deck.filter((card) => card.answer === 'red').length);
  assert.equal(result.players[0].redShown + result.players[0].greenShown, length);
  f.action(f.host, 'replay');
  assert.equal(f.state().phase, 'lobby');
  assert.equal(f.state().players[0].tolerance, undefined);
});

test('auth, names, duplicate votes and old-round votes are checked on the server', () => {
  const f = fixture();
  assert.throws(() => f.service.state(f.host.code, 'bad'), { status: 401 });
  assert.throws(() => f.service.join(f.host.code, { name: ' ada ' }), { status: 409 });
  f.action(f.host, 'start');
  assert.throws(() => f.action(f.host, 'answer', { answer: 'green', round: 0 }), { status: 409 });
  f.action(f.host, 'answer', { answer: 'green', round: 1 });
  assert.throws(() => f.action(f.host, 'answer', { answer: 'red', round: 1 }), { status: 409 });
  assert.throws(() => f.service.join(f.host.code, { name: 'Extra' }), { status: 409 });
});

test('disconnecting never submits a vote; the host can remove an absent player explicitly', () => {
  const f = fixture(); f.action(f.host, 'start');
  f.action(f.host, 'answer', { answer: 'green', round: 1 });
  assert.throws(() => f.action(f.host, 'remove', { playerId: f.players[1].playerId }), { status: 409 });
  f.advance(61000);
  assert.equal(f.state().phase, 'question');
  assert.equal(f.state().players[1].connected, false);
  f.action(f.host, 'remove', { playerId: f.players[1].playerId });
  assert.equal(f.state().phase, 'reveal');
  assert.throws(() => f.state(f.players[1]), { status: 401 });
});

test('host picks topics; the deck uses only chosen categories; bad topics are rejected', () => {
  const f = fixture();
  assert.deepEqual(f.state().categories, ['Base', 'Other']); // default: all free base topics, in bank order
  assert.throws(() => f.action(f.players[1], 'settings', { categories: ['Base'] }), { status: 403 });
  assert.throws(() => f.action(f.host, 'settings', { categories: [] }), { status: 400 });
  assert.throws(() => f.action(f.host, 'settings', { categories: ['Nope'] }), { status: 400 });
  assert.deepEqual(f.action(f.host, 'settings', { categories: ['Base'] }).categories, ['Base']);
  f.action(f.host, 'start');
  const deck = f.service.rooms.get(f.host.code).deck;
  assert.equal(deck.length, 5);
  assert.ok(deck.every((card) => card.category === 'Base'));
});

test('host transfer, leaving, expiry, and rate limiting are bounded', () => {
  const f = fixture(); f.advance(61000);
  assert.equal(f.state(f.players[1]).hostId, f.players[1].playerId);
  f.action(f.host, 'leave');
  assert.equal(f.state(f.players[1]).players.length, 1);
  f.advance(2 * 60 * 60000 + 1);
  assert.throws(() => f.state(f.players[1]), { status: 404 });
  const limiter = new RateLimiter();
  limiter.take('one', 1);
  assert.throws(() => limiter.take('one', 1), { status: 429 });
});
