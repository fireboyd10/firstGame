import { isNativePlatform } from '../platform/native';
import { CapacitorHttp } from '@capacitor/core';
import type { PartyTaste } from './personality';

export interface PartyPlayer extends Partial<PartyTaste> {
  id: string; name: string; answered: boolean; connected: boolean;
  tolerance?: number; appreciation?: number; rank?: number;
}
export interface PartyRoomState {
  code: string; theme: string; phase: 'lobby' | 'question' | 'reveal' | 'finished';
  hostId: string; playerId: string; players: PartyPlayer[];
  round: number; totalRounds: number; deadline: number | null; serverNow: number;
  canAdvance: boolean; scenario: { text: string; difficulty: number } | null;
  results?: Array<{ playerId: string; answer: 'red' | 'green' | null }>;
  discussion?: string; winnerIds?: string[];
}
export interface PartySession { code: string; token: string; playerId: string; name: string; baseUrl: string; joinUrl?: string }
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

async function request<T>(baseUrl: string, path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);
  try {
    if (isNativePlatform()) {
      const response = await CapacitorHttp.request({
        url: `${baseUrl}${path}`, method: init.method || 'GET',
        headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } as Record<string, string>,
        ...(init.body ? { data: JSON.parse(String(init.body)) } : {}),
        connectTimeout: 8000, readTimeout: 8000, responseType: 'json',
      });
      if (!response.data || typeof response.data !== 'object') throw new PartyRequestError('No party server at this address. Check the address printed by npm.cmd run party.');
      if (response.status < 200 || response.status >= 300) throw new PartyRequestError(response.data.error || 'The room could not be reached.', response.status);
      return response.data as T;
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

export async function enterParty(baseUrl: string, name: string, code?: string, totalRounds = 10, theme = 'everyone'): Promise<PartySession> {
  const health = await request<{ service: string; version: number; wifiUrls?: string[] }>(baseUrl, '/api/health');
  if (health.service !== 'red-flag-party' || health.version !== 2) throw new PartyRequestError('Restart the party server with npm.cmd run party to load the latest version.');
  const result = await request<{ code: string; token: string; playerId: string }>(baseUrl, code ? `/api/rooms/${encodeURIComponent(code)}/join` : '/api/rooms', {
    method: 'POST', body: JSON.stringify({ name, totalRounds, theme }),
  });
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseUrl).hostname);
  return { ...result, name, baseUrl, joinUrl: loopback ? health.wifiUrls?.[0] || baseUrl : baseUrl };
}
export function getPartyRoomState(session: PartySession): Promise<PartyRoomState> {
  return request(session.baseUrl, `/api/rooms/${session.code}`, { headers: { Authorization: `Bearer ${session.token}` } });
}
export function partyAction(session: PartySession, action: string, body: object = {}): Promise<PartyRoomState> {
  return request(session.baseUrl, `/api/rooms/${session.code}/${action}`, {
    method: 'POST', headers: { Authorization: `Bearer ${session.token}` }, body: JSON.stringify(body),
  });
}
