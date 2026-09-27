import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { networkInterfaces } from 'node:os';
import { RateLimiter, RoomError } from './rooms.mjs';

export function lanAddresses() {
  return [...new Set(Object.values(networkInterfaces()).flat().filter((entry) => entry && entry.family === 'IPv4' && !entry.internal).map((entry) => entry.address))];
}

export function allowedOrigins(port, extra = []) {
  const origins = new Set(['http://localhost', 'https://localhost', 'capacitor://localhost']);
  for (const host of ['localhost', '127.0.0.1', '[::1]', ...lanAddresses()]) {
    for (const value of new Set([port, 5173, 4173])) origins.add(`http://${host}:${value}`);
  }
  for (const origin of extra) {
    const parsed = new URL(origin);
    if (!['http:', 'https:', 'capacitor:'].includes(parsed.protocol) || parsed.pathname !== '' && parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) throw new Error(`Invalid allowed origin: ${origin}`);
    origins.add(origin.replace(/\/$/, ''));
  }
  return origins;
}

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function body(request) {
  if (request.headers['content-length'] && Number(request.headers['content-length']) > 2048) throw new RoomError(413, 'Request is too large.');
  if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new RoomError(415, 'Use application/json for room actions.');
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2048) throw new RoomError(413, 'Request is too large.');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new RoomError(400, 'Send a valid JSON object.'); }
}

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

export function createPartyServer({ service, dist, origins = allowedOrigins(3000), limiter = new RateLimiter() }) {
  const webRoot = resolve(dist);
  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        const origin = request.headers.origin;
        if (origin && !origins.has(origin)) throw new RoomError(403, 'This app origin is not allowed by the party server.');
        if (origin) {
          response.setHeader('Access-Control-Allow-Origin', origin);
          response.setHeader('Vary', 'Origin');
          response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
          response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        }
        if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
        if (url.pathname === '/api/health' && request.method === 'GET') {
          json(response, 200, { service: 'red-flag-party', version: 2, wifiUrls: lanAddresses().map((address) => `http://${address}:${request.socket.localPort}`) }); return;
        }
        const address = request.socket.remoteAddress || 'unknown';
        limiter.take(`all:${address}`, 1200);
        const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.authorization || '')?.[1];
        if (request.method === 'POST') limiter.take(`write:${address}`, 180);
        if (url.pathname === '/api/rooms' && request.method === 'POST') {
          limiter.take(`join:${address}`, 30);
          json(response, 201, service.create(await body(request))); return;
        }
        const route = /^\/api\/rooms\/([A-Z2-9]{6})(?:\/(join|start|answer|next|leave|replay|settings|remove))?$/.exec(url.pathname);
        if (!route) throw new RoomError(404, 'Room endpoint not found.');
        const [, code, action] = route;
        if (request.method === 'GET' && !action) { json(response, 200, service.state(code, token)); return; }
        if (request.method === 'POST' && action) {
          const payload = await body(request);
          if (action === 'join') { limiter.take(`join:${address}`, 30); json(response, 201, service.join(code, payload)); }
          else json(response, 200, service.action(code, token, action, payload));
          return;
        }
        throw new RoomError(405, 'Use GET to read a room or POST for a room action.');
      }
      if (!['GET', 'HEAD'].includes(request.method)) throw new RoomError(405, 'Method not allowed.');
      let path;
      try { path = decodeURIComponent(url.pathname); } catch { throw new RoomError(400, 'Invalid path.'); }
      const file = resolve(webRoot, `.${path === '/' ? '/index.html' : path}`);
      if (!file.startsWith(`${webRoot}${sep}`)) throw new RoomError(404, 'File not found.');
      try {
        if (!(await stat(file)).isFile()) throw new Error();
        const data = await readFile(file);
        response.writeHead(200, {
          'Content-Type': types[extname(file)] || 'application/octet-stream',
          'Cache-Control': /[\\/]assets[\\/]/.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache',
        });
        response.end(request.method === 'HEAD' ? undefined : data);
      } catch { throw new RoomError(404, 'File not found. Run npm run party to build and start the game.'); }
    } catch (error) {
      if (response.headersSent || response.destroyed) return;
      if (error.status === 429) response.setHeader('Retry-After', '60');
      if (!(error instanceof RoomError)) console.error('Party request failed:', error.message);
      json(response, error instanceof RoomError ? error.status : 500, { error: error instanceof RoomError ? error.message : 'The party server had a problem. Try again.' });
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  const sweep = setInterval(() => service.sweep(), 60_000);
  sweep.unref();
  server.on('close', () => clearInterval(sweep));
  return server;
}
