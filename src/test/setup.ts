// In-memory IndexedDB for Node. Must load before Dexie is imported.
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';

// Tests never reach the network: the exchange-rate API looks offline unless a test stubs `fetch`.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new TypeError('no network in tests'))),
  );
});
afterEach(() => vi.unstubAllGlobals());

// Component tests (`@vitest-environment happy-dom`) only: unmount what `render` mounted.
if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => cleanup());
}
