import { isNativePlatform } from '../platform/native';
import type { PartyTaste } from './personality';
import { PhoneParty, hostPhoneRoom, requestPhoneRoom, type PhoneEndpoint } from './phone-host';

export interface PartyPlayer extends Partial<PartyTaste> {
  id: string; name: string; answered: boolean; connected: boolean;
  tolerance?: number; appreciation?: number; rank?: number;
}
export interface PartyRoomState {
  code: string; theme: string; phase: 'lobby' | 'question' | 'reveal' | 'finished';
  hostId: string; playerId: string; players: PartyPlayer[];
  round: number; totalRounds: number; deadline: number | null; serverNow: number;
  canAdvance: boolean; scenario: { text: string; difficulty: number } | null;
  categories?: string[];
  results?: Array<{ playerId: string; answer: 'red' | 'green' | null }>;
  discussion?: string; winnerIds?: string[];
}
export interface PartySession { code: string; token: string; playerId: string; name: string; baseUrl: string; joinUrl?: string; phone?: PhoneEndpoint; hosting?: boolean }
export class PartyRequestError extends Error {
  constructor(message: string, readonly status = 0) { super(message); }
}

export function detectPartyBaseUrl(): string {
  return import.meta.env.VITE_PARTY_SERVER_URL || (isNativePlatform() ? '' : window.location.origin);
}
export function normalizePartyUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Enter the full party address, including http:// or https://.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Use the server address only, for example http://192.168.1.20:3000.');
  }
  if (!isNativePlatform() && window.location.protocol === 'https:' && url.protocol === 'http:') {
    throw new Error('Open the Wi-Fi server address directly in your browser, or use an HTTPS party server.');
  }
  return url.origin;
}

export function verifyPhoneIdentity(endpoint: PhoneEndpoint, code: string): PhoneEndpoint {
  const securityCode = code.replace(/[\s-]/g, '').toLowerCase();
  if (!/^[0-9a-f]{12}$/.test(securityCode)) throw new Error('Enter the security code displayed on the host phone.');
  if (!/^[0-9a-f]{64}$/.test(endpoint.fingerprint) || endpoint.fingerprint.slice(0, 12) !== securityCode) {
    throw new Error('The security code does not match this host. Check the code on your friend\'s phone.');
  }
  return endpoint;
}

async function request<T>(baseUrl: string, path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);
  try {
    if (isNativePlatform()) {
      throw new PartyRequestError('This saved room uses an older connection. Create or join a secure phone room again.');
    }
    const response = await fetch(`${baseUrl}${path}`, {
      ...init, signal: controller.signal, cache: 'no-store',
      headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    });
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new PartyRequestError('No party server at this address. On the computer, run npm.cmd run party, then open its Same Wi-Fi address on every phone.');
    }
    const value = await response.json();
    if (!response.ok) throw new PartyRequestError(value.error || `The server returned ${response.status}. Try again.`, response.status);
    return value as T;
  } catch (error) {
    if (error instanceof PartyRequestError) throw error;
    throw new PartyRequestError('Cannot reach the party server. Keep its terminal open, use the same Wi-Fi address on every device, and allow Node on your private network.');
  } finally { window.clearTimeout(timer); }
}

export async function enterParty(baseUrl: string, name: string, code?: string, totalRounds = 10, theme = 'everyone', categories?: string[], securityCode = ''): Promise<PartySession> {
  if (isNativePlatform()) {
    try {
      if (!code) {
        const created = await hostPhoneRoom({ name, totalRounds, theme, categories });
        return { code: created.code, token: created.token, playerId: created.playerId, name, baseUrl: `phone://${created.code}`, phone: created.endpoint, hosting: true, joinUrl: `https://${created.endpoint.host}:${created.endpoint.port}` };
      }
      let endpoint: PhoneEndpoint;
      const pinCode = securityCode.replace(/[\s-]/g, '').toLowerCase();
      if (!/^[0-9a-f]{12}$/.test(pinCode)) throw new Error('Enter the security code displayed on the host phone.');
      if (baseUrl) {
        const address = new URL(normalizePartyUrl(baseUrl));
        const host = address.hostname.replace(/^\[|\]$/g, '');
        if (!address.port || !/^[0-9a-fA-F:.%]+$/.test(host)) throw new Error('Use the connection address shown on the host phone.');
        endpoint = await PhoneParty.inspectHost({ host, port: Number(address.port), securityCode: pinCode });
      } else endpoint = await PhoneParty.discover({ code });
      verifyPhoneIdentity(endpoint, pinCode);
      const reply = await requestPhoneRoom(endpoint, code, { method: 'POST', path: `/api/rooms/${code}/join`, body: { name } });
      const data = reply.data as { code: string; token: string; playerId: string; error?: string };
      if (reply.status !== 200) throw new PartyRequestError(data.error || 'Could not join this room.', reply.status);
      return { ...data, name, baseUrl: `phone://${code}`, phone: endpoint };
    } catch (error) { throw error instanceof Error ? error : new PartyRequestError('Cannot reach the host phone. Check Wi-Fi and the room code.'); }
  }
  const health = await request<{ service: string; version: number; wifiUrls?: string[] }>(baseUrl, '/api/health');
  if (health.service !== 'red-flag-party' || health.version !== 2) throw new PartyRequestError('Restart the party server with npm.cmd run party to load the latest version.');
  const result = await request<{ code: string; token: string; playerId: string }>(baseUrl, code ? `/api/rooms/${encodeURIComponent(code)}/join` : '/api/rooms', {
    method: 'POST', body: JSON.stringify({ name, totalRounds, theme, categories }),
  });
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseUrl).hostname);
  return { ...result, name, baseUrl, joinUrl: loopback ? health.wifiUrls?.[0] || baseUrl : baseUrl };
}
async function phoneRequest(session: PartySession, path: string, method: string, body?: object): Promise<PartyRoomState> {
  const reply = await requestPhoneRoom(session.phone!, session.code, { path, method, body, token: session.token });
  if (reply.status !== 200) throw new PartyRequestError((reply.data as { error?: string }).error || 'The room could not be reached.', reply.status);
  return reply.data as PartyRoomState;
}
export function getPartyRoomState(session: PartySession): Promise<PartyRoomState> {
  if (session.phone) return phoneRequest(session, `/api/rooms/${session.code}`, 'GET');
  return request(session.baseUrl, `/api/rooms/${session.code}`, { headers: { Authorization: `Bearer ${session.token}` } });
}
export function partyAction(session: PartySession, action: string, body: object = {}): Promise<PartyRoomState> {
  if (session.phone) return phoneRequest(session, `/api/rooms/${session.code}/${action}`, 'POST', body);
  return request(session.baseUrl, `/api/rooms/${session.code}/${action}`, {
    method: 'POST', headers: { Authorization: `Bearer ${session.token}` }, body: JSON.stringify(body),
  });
}
