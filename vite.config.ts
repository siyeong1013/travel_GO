/// <reference types="vitest/config" />
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin, type PreviewServer, type ViteDevServer } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { answerFlightRequest } from './api/flight.ts';

/**
 * `/api/flight` on the dev and preview servers, as Vercel runs it (api/flight.ts). The key comes
 * from .env.local (`AERODATABOX_API_KEY`, not `VITE_`: it never reaches the app's code).
 */
function flightApi(): Plugin {
  const serve = (server: ViteDevServer | PreviewServer) => {
    const env = loadEnv(server.config.mode, server.config.root, '');
    server.middlewares.use('/api/flight', (req: IncomingMessage, res: ServerResponse) => {
      void (async () => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(req.headers)) {
          if (typeof value === 'string') headers.set(name, value);
        }
        const path = (req as IncomingMessage & { originalUrl?: string }).originalUrl ?? '/';
        const response = await answerFlightRequest(
          new Request(new URL(path, 'http://localhost'), { headers }),
          env,
        );
        res.statusCode = response.status;
        response.headers.forEach((value, name) => res.setHeader(name, value));
        res.end(await response.text());
      })();
    });
  };
  return { name: 'travel-go:flight-api', configureServer: serve, configurePreviewServer: serve };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    flightApi(),
    VitePWA({
      // The worker takes over as soon as it is installed, and the new version shows on the next
      // start: nothing reloads under the user (an expense being typed would be lost).
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'travel GO',
        short_name: 'travel GO',
        description: '여행 일정과 경비를 한곳에서 관리하고, 동행자와 정산해요.',
        lang: 'ko',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        categories: ['travel'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // Precaches the app shell only. Requests to Google Maps (terms) and the exchange-rate API
      // (the app keeps rates itself) are left to the network.
      workbox: {
        navigateFallback: 'index.html',
        // The server's own addresses (api/) are not screens.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
  },
  test: {
    setupFiles: ['./src/test/setup.ts'],
    // Never fetch external scripts (e.g. the Google Maps API) in component tests.
    environmentOptions: { happyDOM: { settings: { disableJavaScriptFileLoading: true } } },
  },
});
