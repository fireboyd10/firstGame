import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { RoomService } from './rooms.mjs';
import { allowedOrigins, createPartyServer, lanAddresses } from './http.mjs';

const project = resolve(import.meta.dirname, '..');
const port = Number(process.env.PARTY_PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PARTY_PORT must be a port from 1 to 65535.');
let scenarios;
try { scenarios = JSON.parse(await readFile(resolve(project, 'server/data/scenarios.json'), 'utf8')); }
catch { console.error('Build the party data first: npm run build:server (or npm run party).'); process.exit(1); }
const extra = (process.env.PARTY_ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean);
try { await readFile(resolve(project, 'dist/index.html')); }
catch { console.error('Build the web game first: npm run party.'); process.exit(1); }
const server = createPartyServer({ service: new RoomService(scenarios), dist: resolve(project, 'dist'), origins: allowedOrigins(port, extra) });
server.on('error', (error) => { console.error(`Cannot start the party server: ${error.message}`); process.exitCode = 1; });
server.listen(port, '0.0.0.0', () => {
  console.log(`RED FLAG RUSH party server: http://localhost:${port}/`);
  for (const address of lanAddresses()) console.log(`Same Wi-Fi: http://${address}:${port}/`);
  console.log('Open the same Wi-Fi URL on each phone. Keep this terminal running. Ctrl+C stops the party.');
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); server.closeIdleConnections(); });
