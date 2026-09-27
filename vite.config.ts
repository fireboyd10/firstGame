import { defineConfig, type Plugin, type ViteDevServer, type PreviewServer } from 'vite';
import { partyScenarios } from './src/data/party-scenarios';

// The API uses the same Wi-Fi address as the page. These modules stay in Node.
function partyApi(): Plugin {
  async function mount(server: ViteDevServer | PreviewServer, port: number) {
    const roomsUrl = new URL('./server/rooms.mjs', import.meta.url).href;
    const httpUrl = new URL('./server/http.mjs', import.meta.url).href;
    const [{ RoomService }, { createPartyServer, allowedOrigins }] = await Promise.all([import(roomsUrl), import(httpUrl)]);
    const api = createPartyServer({ service: new RoomService(partyScenarios), dist: 'dist', origins: allowedOrigins(port) });
    server.middlewares.use((request, response, next) => {
      if (request.url?.startsWith('/api/')) api.emit('request', request, response);
      else next();
    });
    server.httpServer?.once('close', () => api.close());
  }
  return {
    name: 'party-api',
    configureServer: (server) => mount(server, server.config.server.port ?? 5173),
    configurePreviewServer: (server) => mount(server, server.config.preview.port ?? 4173),
  };
}

export default defineConfig({
  base: './',
  plugins: [partyApi()],
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
  preview: { host: '0.0.0.0', port: 4173, strictPort: true },
  build: { target: 'es2020' },
});
