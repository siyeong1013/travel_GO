/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
