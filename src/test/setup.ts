// In-memory IndexedDB for Node. Must load before Dexie is imported.
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// Component tests (`@vitest-environment happy-dom`) only: unmount what `render` mounted.
if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => cleanup());
}
