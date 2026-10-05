import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { RoomService, RateLimiter, RoomError } from '../../server/rooms.mjs';
import { partyScenarios } from '../data/party-scenarios';

export interface PhoneEndpoint { host: string; port: number; fingerprint: string; }
interface PhoneRequest { id?: string; peer?: string; method: string; path: string; token?: string; body?: object; }
interface Reply { status: number; data: unknown; }
export interface PhonePartyPlugin {
  startHost(options: { code: string }): Promise<PhoneEndpoint>;
  stopHost(): Promise<void>;
  discover(options: { code: string }): Promise<PhoneEndpoint>;
  inspectHost(options: { host: string; port: number; securityCode: string }): Promise<PhoneEndpoint>;
  sha256(options: { value: string }): Promise<{ digest: string }>;
  request(options: PhoneEndpoint & PhoneRequest): Promise<Reply>;
  reply(options: Reply & { id: string }): Promise<void>;
  addListener(event: 'request', listener: (request: PhoneRequest) => void): Promise<PluginListenerHandle>;
}
export const PhoneParty = registerPlugin<PhonePartyPlugin>('PhoneParty');
let hosted: { service: RoomService; code: string; endpoint: PhoneEndpoint } | null = null;
let listener: PluginListenerHandle | null = null;
let starting = false;
let expiryTimer: ReturnType<typeof setInterval> | null = null;
const limiter = new RateLimiter();

export function routePhoneRequest(service: RoomService, code: string, request: PhoneRequest): Reply {
  try {
    if (request.method === 'GET' && request.path === '/api/health') return { status: 200, data: { service: 'red-flag-party', version: 2, code } };
    const match = /^\/api\/rooms\/([A-Z2-9]{6})(?:\/(join|start|answer|next|leave|replay|settings|remove))?$/.exec(request.path);
    if (!match || match[1] !== code) throw new RoomError(404, 'Room not found. Check the code.');
    const action = match[2];
    let data: unknown;
    if (request.method === 'GET' && !action) data = service.state(code, request.token || '');
    else if (request.method === 'POST' && action === 'join') data = service.join(code, request.body || {});
    else if (request.method === 'POST' && action) data = service.action(code, request.token || '', action, request.body || {});
    else throw new RoomError(405, 'Invalid room request.');
    return { status: 200, data };
  } catch (error) {
    return { status: error instanceof RoomError ? error.status : 500, data: { error: error instanceof RoomError ? error.message : 'The room could not process this request.' } };
  }
}

export async function hostPhoneRoom(options: object): Promise<{ code: string; token: string; playerId: string; endpoint: PhoneEndpoint }> {
  if (starting) throw new Error('A room is already being created.');
  hosted?.service.sweep();
  if (hosted?.service.rooms.size) throw new Error('Your phone is still hosting a party. Finish that party before creating another room.');
  starting = true;
  try {
    await stopPhoneHost();
    const service = new RoomService(partyScenarios, { maxRooms: 1 });
    const session = service.create(options);
    listener = await PhoneParty.addListener('request', request => {
      let reply: Reply;
      try {
        limiter.take(`phone:${request.peer || 'peer'}`, 1200);
        if (request.path.endsWith('/join')) limiter.take(`join:${request.peer || 'peer'}`, 30);
        reply = routePhoneRequest(service, session.code, request);
      } catch { reply = { status: 429, data: { error: 'Too many requests. Try again in a moment.' } }; }
      if (request.id) void PhoneParty.reply({ ...reply, id: request.id }).catch(() => { /* Peer disconnected. */ });
      if (!service.rooms.size) void stopPhoneHost();
    });
    const endpoint = await PhoneParty.startHost({ code: session.code });
    hosted = { service, code: session.code, endpoint };
    expiryTimer = setInterval(() => {
      service.sweep();
      if (!service.rooms.size) void stopPhoneHost().catch(() => {});
    }, 60_000);
    return { ...session, endpoint };
  } catch (error) {
    await stopPhoneHost();
    throw error;
  } finally { starting = false; }
}

export async function stopPhoneHost(): Promise<void> {
  hosted = null;
  if (expiryTimer) clearInterval(expiryTimer);
  expiryTimer = null;
  const previous = listener; listener = null;
  await previous?.remove();
  await PhoneParty.stopHost();
}

export async function requestPhoneRoom(endpoint: PhoneEndpoint, code: string, request: PhoneRequest): Promise<Reply> {
  if (hosted?.code === code && hosted.endpoint.host === endpoint.host && hosted.endpoint.port === endpoint.port) {
    const result = routePhoneRequest(hosted.service, code, request);
    if (!hosted.service.rooms.size) await stopPhoneHost();
    return result;
  }
  return PhoneParty.request({ ...endpoint, ...request });
}
