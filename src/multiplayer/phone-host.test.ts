import { describe, expect, it } from 'vitest';
import { RoomService } from '../../server/rooms.mjs';
import { routePhoneRequest } from './phone-host';

const cards = Array.from({ length: 32 }, (_, index) => ({ id: String(index), text: `Situation ${index}`, answer: index % 2 ? 'green' : 'red', category: 'Base', difficulty: 1, discussion: 'What do you think?' }));
describe('phone-hosted rooms use the existing party rules', () => {
  for (const rounds of [5, 10, 15]) it(`plays a complete ${rounds}-round party with eight phones`, () => {
    const service = new RoomService(cards, { random: max => max - 1 });
    const host = service.create({ name: 'Host', totalRounds: rounds });
    const send = (method: string, path: string, token?: string, body?: object) => routePhoneRequest(service, host.code, { method, path, token, body });
    const players = [host];
    for (let i = 1; i < 8; i++) {
      const reply = send('POST', `/api/rooms/${host.code}/join`, undefined, { name: `Guest ${i}` });
      expect(reply.status).toBe(200); players.push(reply.data as typeof host);
    }
    expect(send('POST', `/api/rooms/${host.code}/join`, undefined, { name: 'Ninth' }).status).toBe(409);
    const action = (player: typeof host, name: string, body = {}) => send('POST', `/api/rooms/${host.code}/${name}`, player.token, body);
    expect(action(players[1], 'start').status).toBe(403);
    expect(action(host, 'start').status).toBe(200);
    for (let round = 1; round <= rounds; round++) {
      for (const player of players.slice(0, -1)) expect(action(player, 'answer', { answer: 'green', round }).status).toBe(200);
      const hidden = send('GET', `/api/rooms/${host.code}`, host.token).data as { phase: string; scenario: object; results?: object };
      expect(hidden.phase).toBe('question'); expect(hidden.scenario).not.toHaveProperty('answer'); expect(hidden.results).toBeUndefined();
      expect(action(host, 'next').status).toBe(409);
      const revealed = action(players[7], 'answer', { answer: 'green', round }).data as { phase: string; results: unknown[] };
      expect(revealed.phase).toBe('reveal'); expect(revealed.results).toHaveLength(8);
      expect(action(host, 'answer', { answer: 'red', round }).status).toBe(409);
      expect(action(host, 'next').status).toBe(200);
    }
    const result = send('GET', `/api/rooms/${host.code}`, host.token).data as { phase: string; players: Array<{ rank: number; tolerance: number; appreciation: number }> };
    expect(result.phase).toBe('finished');
    expect(result.players.every(player => player.rank === 1 && player.tolerance === 100 && player.appreciation === 100)).toBe(true);
    expect(action(host, 'replay').data).toHaveProperty('phase', 'lobby');
  });
  it('rejects other rooms, invalid tokens and remote room creation', () => {
    const service = new RoomService(cards);
    const host = service.create({ name: 'Host' });
    expect(routePhoneRequest(service, host.code, { method: 'GET', path: `/api/rooms/${host.code}`, token: 'invalid' }).status).toBe(401);
    expect(routePhoneRequest(service, host.code, { method: 'GET', path: '/api/rooms/ABCDEF', token: host.token }).status).toBe(404);
    expect(routePhoneRequest(service, host.code, { method: 'POST', path: '/api/rooms', body: { name: 'Other host' } }).status).toBe(404);
  });
});
