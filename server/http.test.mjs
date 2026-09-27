import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createPartyServer } from './http.mjs';
import { RoomService } from './rooms.mjs';

test('room HTTP endpoints work and report malformed, unauthorized, and cross-origin requests', async () => {
  const cards = Array.from({ length: 16 }, (_, i) => ({ id: String(i), text: 'A situation', answer: i % 2 ? 'red' : 'green' }));
  const server = createPartyServer({ service: new RoomService(cards), dist: 'dist', origins: new Set(['http://localhost:5173']) });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, data, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) });
  try {
    assert.equal((await (await fetch(base + '/api/health')).json()).service, 'red-flag-party');
    const created = await post('/api/rooms', { name: 'Host', totalRounds: 5 });
    assert.equal(created.status, 201);
    const room = await created.json();
    assert.equal((await fetch(base + `/api/rooms/${room.code}`)).status, 401);
    const current = await fetch(base + `/api/rooms/${room.code}`, { headers: { Authorization: `Bearer ${room.token}` } });
    assert.equal((await current.json()).totalRounds, 5);
    assert.equal((await post('/api/rooms', { name: 'Host' }, { Origin: 'https://unrelated.example' })).status, 403);
    const allowed = await post('/api/rooms', { name: 'Host' }, { Origin: 'http://localhost:5173' });
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.equal((await post('/api/rooms', { name: 'Host' }, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await post('/api/rooms', { name: 'x'.repeat(3000) })).status, 413);
    assert.equal((await fetch(base + '/server/data/scenarios.json')).status, 404);
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});
