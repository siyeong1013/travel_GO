// In-memory IndexedDB for Node. Must load before Dexie is imported.
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';

// Tests never reach the network: the exchange-rate API looks offline unless a test stubs `fetch`,
// and place search has no API key unless a test stubs the Places API (`stubPlacesApi`).
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new TypeError('no network in tests'))),
  );
  // Vitest also reads .env.local: tests must not depend on whether a real key is set there.
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '');
  vi.stubEnv('VITE_GOOGLE_MAPS_MAP_ID', '');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// Component tests (`@vitest-environment happy-dom`) only: unmount what `render` mounted.
if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => cleanup());
}
