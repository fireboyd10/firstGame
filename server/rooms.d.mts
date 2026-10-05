export class RoomError extends Error { constructor(status: number, message: string); status: number; }
export class RoomService {
  constructor(scenarios: unknown[], options?: { now?: () => number; random?: (max: number) => number; maxRooms?: number });
  rooms: Map<string, unknown>;
  sweep(): void;
  create(options: object): { code: string; token: string; playerId: string };
  join(code: string, options: object): { code: string; token: string; playerId: string };
  state(code: string, token: string): unknown;
  action(code: string, token: string, action: string, body?: object): unknown;
}
export class RateLimiter {
  constructor(options?: object);
  take(key: string, limit: number): void;
}
