import { randomBytes, randomInt, randomUUID } from 'node:crypto';

export class RoomError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new RoomError(status, message); };
const THEMES = new Set(['everyone', 'girls', 'boys']);
const ROUND_MS = 30_000;
const ROOM_TTL = 2 * 60 * 60_000;
const STALE_MS = 60_000;
const LENGTHS = new Set([5, 10, 15]);

function playerName(value) {
  if (typeof value !== 'string') fail(400, 'Enter a player name.');
  const name = value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (!name || name.length > 24) fail(400, 'Names must contain 1 to 24 characters.');
  return name;
}

/** The room server keeps editorial answers and running verdicts private. */
export class RoomService {
  constructor(scenarios, { now = Date.now, random = randomInt, maxRooms = 500 } = {}) {
    if (!Array.isArray(scenarios) || ['red', 'green'].some((answer) => scenarios.filter((card) => card.answer === answer).length < 8)) throw new Error('At least eight scenarios of each flag are required.');
    this.scenarios = scenarios;
    this.now = now;
    this.random = random;
    this.maxRooms = maxRooms;
    this.rooms = new Map();
  }

  sweep() {
    const cutoff = this.now() - ROOM_TTL;
    for (const [code, room] of this.rooms) if (room.touchedAt <= cutoff) this.rooms.delete(code);
  }

  create({ name, theme = 'everyone', totalRounds = 10 } = {}) {
    name = playerName(name);
    if (!THEMES.has(theme)) fail(400, 'Choose a valid room theme.');
    if (!LENGTHS.has(totalRounds)) fail(400, 'Choose 5, 10, or 15 scenarios.');
    this.sweep();
    if (this.rooms.size >= this.maxRooms) fail(503, 'All party rooms are busy. Try again later.');
    let code;
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    do { code = Array.from({ length: 6 }, () => alphabet[this.random(alphabet.length)]).join(''); } while (this.rooms.has(code));
    const room = { code, theme, totalRounds, players: [], hostId: '', phase: 'lobby', round: 0, deck: [], deadline: null, revealedAt: null, touchedAt: this.now() };
    this.rooms.set(code, room);
    const joined = this.addPlayer(room, name);
    room.hostId = joined.playerId;
    return joined;
  }

  addPlayer(room, name) {
    if (room.players.length >= 8) fail(409, 'This room already has eight players.');
    if (room.players.some((player) => player.name.toLocaleLowerCase() === name.toLocaleLowerCase())) fail(409, 'That name is already in this room. Choose another.');
    const player = { id: randomUUID(), token: randomBytes(32).toString('base64url'), name, answer: null, redAccepted: 0, greenAccepted: 0, lastSeen: this.now() };
    room.players.push(player);
    room.touchedAt = this.now();
    return { code: room.code, token: player.token, playerId: player.id };
  }

  join(code, { name } = {}) {
    name = playerName(name);
    const room = this.find(code);
    if (room.phase !== 'lobby') fail(409, 'This party has started. Join when the host opens another round.');
    return this.addPlayer(room, name);
  }

  find(code) {
    if (typeof code !== 'string' || !/^[A-Z2-9]{6}$/.test(code)) fail(404, 'Room not found. Check the six-character code.');
    const room = this.rooms.get(code);
    if (!room || room.touchedAt <= this.now() - ROOM_TTL) {
      this.rooms.delete(code);
      fail(404, 'Room not found or expired. Create a new party.');
    }
    return room;
  }

  authenticate(room, token) {
    const player = typeof token === 'string' && room.players.find((candidate) => candidate.token === token);
    if (!player) fail(401, 'This player session is no longer in the room. Join again.');
    player.lastSeen = this.now();
    room.touchedAt = this.now();
    this.update(room);
    return player;
  }

  update(room) {
    const host = room.players.find((player) => player.id === room.hostId);
    if (!host || host.lastSeen <= this.now() - STALE_MS) {
      const active = room.players.find((player) => player.lastSeen > this.now() - STALE_MS);
      if (active) room.hostId = active.id;
    }
    // Reveal as soon as everyone has voted; the timer never forces a missing vote.
    if (room.phase === 'question' && room.players.every((player) => player.answer !== null)) this.reveal(room);
  }

  reveal(room) {
    room.phase = 'reveal';
    room.deadline = null;
    room.revealedAt = this.now();
    const scenario = room.deck[room.round - 1];
    for (const player of room.players) {
      if (player.answer === null) continue;
      if (player.answer === 'green') {
        if (scenario.answer === 'red') player.redAccepted += 1;
        else player.greenAccepted += 1;
      }
    }
  }

  question(room) {
    room.phase = 'question';
    room.round += 1;
    room.deadline = this.now() + ROUND_MS;
    room.revealedAt = null;
    for (const player of room.players) player.answer = null;
  }

  state(code, token) {
    const room = this.find(code);
    const player = this.authenticate(room, token);
    return this.view(room, player);
  }

  view(room, player) {
    const finished = room.phase === 'finished';
    const redShown = room.deck.filter((card) => card.answer === 'red').length;
    const greenShown = room.deck.length - redShown;
    const players = room.players.map((member) => ({
      id: member.id, name: member.name,
      answered: member.answer !== null,
      connected: member.lastSeen > this.now() - STALE_MS,
      ...(finished ? { redAccepted: member.redAccepted, greenAccepted: member.greenAccepted, redShown, greenShown,
        tolerance: Math.round(member.redAccepted / redShown * 100),
        appreciation: Math.round(member.greenAccepted / greenShown * 100),
        rank: 1 + room.players.filter((other) => other.redAccepted / redShown > member.redAccepted / redShown).length } : {}),
    }));
    const scenario = room.deck[room.round - 1];
    const state = {
      code: room.code, theme: room.theme, phase: room.phase, hostId: room.hostId, playerId: player.id, players,
      round: room.round, totalRounds: room.totalRounds, deadline: room.deadline, serverNow: this.now(),
      canAdvance: room.phase === 'reveal' && room.hostId === player.id,
      scenario: scenario ? { text: scenario.text, difficulty: scenario.difficulty } : null,
    };
    if (room.phase === 'reveal') {
      state.results = room.players.map((member) => ({ playerId: member.id, answer: member.answer }));
      state.discussion = scenario.discussion || 'What would change your mind?';
    }
    if (finished) {
      const highest = Math.max(...room.players.map((member) => member.redAccepted / redShown));
      state.winnerIds = room.players.filter((member) => member.redAccepted / redShown === highest).map((member) => member.id);
    }
    return state;
  }

  action(code, token, action, body = {}) {
    const room = this.find(code);
    const player = this.authenticate(room, token);
    if (['start', 'next', 'replay', 'settings', 'remove'].includes(action) && room.hostId !== player.id) fail(403, 'Only the host can do that.');
    switch (action) {
      case 'settings':
        if (room.phase !== 'lobby') fail(409, 'Change the game length in the lobby.');
        if (!LENGTHS.has(body.totalRounds)) fail(400, 'Choose 5, 10, or 15 scenarios.');
        room.totalRounds = body.totalRounds;
        break;
      case 'start': {
        if (room.phase !== 'lobby') fail(409, 'This party has already started.');
        if (room.players.length < 2) fail(409, 'At least two players are needed.');
        const shuffle = (cards) => {
          for (let index = cards.length - 1; index > 0; index--) {
            const other = this.random(index + 1);
            [cards[index], cards[other]] = [cards[other], cards[index]];
          }
          return cards;
        };
        // Both percentages always have a meaningful denominator, even in a short game.
        const redCount = Math.floor(room.totalRounds / 2) + (room.totalRounds % 2 ? this.random(2) : 0);
        room.deck = shuffle([
          ...shuffle(this.scenarios.filter((card) => card.answer === 'red')).slice(0, redCount),
          ...shuffle(this.scenarios.filter((card) => card.answer === 'green')).slice(0, room.totalRounds - redCount),
        ]);
        this.question(room);
        break;
      }
      case 'answer':
        if (!['red', 'green'].includes(body.answer) || !Number.isInteger(body.round)) fail(400, 'Choose red or green for the current round.');
        if (room.phase !== 'question' || body.round !== room.round) fail(409, 'This question has closed.');
        if (player.answer !== null) fail(409, 'Your vote is already locked in.');
        player.answer = body.answer;
        this.update(room);
        break;
      case 'next':
        if (room.phase !== 'reveal') fail(409, 'Wait for everyone to vote before moving on.');
        if (room.round === room.totalRounds) room.phase = 'finished';
        else this.question(room);
        break;
      case 'replay':
        if (room.phase !== 'finished') fail(409, 'Finish this party before starting another.');
        room.phase = 'lobby'; room.round = 0; room.deck = []; room.deadline = null; room.revealedAt = null;
        for (const member of room.players) { member.answer = null; member.redAccepted = 0; member.greenAccepted = 0; }
        break;
      case 'remove': {
        const leaving = room.players.find((member) => member.id === body.playerId);
        if (!leaving || leaving === player) fail(400, 'Choose a disconnected player to remove.');
        if (leaving.lastSeen > this.now() - STALE_MS) fail(409, 'That player is still connected. Give them time to vote.');
        room.players = room.players.filter((member) => member !== leaving);
        this.update(room);
        break;
      }
      case 'leave':
        room.players = room.players.filter((member) => member !== player);
        if (!room.players.length) this.rooms.delete(code);
        else this.update(room);
        return { left: true };
      default: fail(404, 'Unknown room action.');
    }
    return this.view(room, player);
  }
}

/** Bounded per-IP windows: polling is cheap; room creation has a tighter limit. */
export class RateLimiter {
  constructor({ now = Date.now, windowMs = 60_000, maxKeys = 10_000 } = {}) {
    this.now = now; this.windowMs = windowMs; this.maxKeys = maxKeys; this.buckets = new Map();
  }
  take(key, limit) {
    const now = this.now();
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      for (const [id, candidate] of this.buckets) if (candidate.resetAt <= now) this.buckets.delete(id);
      if (this.buckets.size >= this.maxKeys) fail(429, 'Server is busy. Try again in a minute.');
      bucket = { count: 0, resetAt: now + this.windowMs }; this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > limit) fail(429, 'Too many requests. Wait a minute and try again.');
  }
}
