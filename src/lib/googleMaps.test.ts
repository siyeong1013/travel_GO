/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { googleMapsApiKey, importMapsLibrary } from '@/lib/googleMaps';

/** `google.maps` as the loader leaves it on the page. */
const maps = () =>
  (globalThis as unknown as { google: { maps: Record<string, (...args: unknown[]) => unknown> } })
    .google.maps;

describe('importMapsLibrary', () => {
  let scripts: HTMLScriptElement[];

  beforeEach(() => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', ' test-key ');
    vi.stubGlobal('google', undefined);
    scripts = [];
    // Keep the API's script out of the page: nothing is fetched.
    vi.spyOn(document.head, 'append').mockImplementation((...nodes) => {
      scripts.push(...(nodes as HTMLScriptElement[]));
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('reads the key from the environment', () => {
    expect(googleMapsApiKey()).toBe('test-key');
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '');
    expect(googleMapsApiKey()).toBe('');
  });

  it('adds the API script once, on first use, and then uses the real API', async () => {
    const first = importMapsLibrary('places');
    const second = importMapsLibrary('places');
    expect(scripts).toHaveLength(1);
    const url = new URL(scripts[0]!.src);
    expect(`${url.origin}${url.pathname}`).toBe('https://maps.googleapis.com/maps/api/js');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      key: 'test-key',
      v: 'weekly',
      language: 'ko',
      libraries: 'places',
      callback: 'google.maps.__ib__',
    });

    // What the loaded API does: put the real importLibrary in place, then call back.
    const library = { name: 'places' };
    const realImport = vi.fn(async () => library);
    maps().importLibrary = realImport;
    maps().__ib__!();
    await expect(first).resolves.toBe(library);
    await expect(second).resolves.toBe(library);
    await expect(importMapsLibrary('places')).resolves.toBe(library);
    expect(realImport).toHaveBeenCalledTimes(3);
    expect(scripts).toHaveLength(1);
  });

  it('tries again after the script failed to load (e.g. offline)', async () => {
    const first = importMapsLibrary('places');
    scripts[0]!.onerror!(new Event('error'));
    await expect(first).rejects.toThrow('could not load');

    void importMapsLibrary('places');
    expect(scripts).toHaveLength(2);
  });

  it('uses an API that is already on the page', async () => {
    const library = { name: 'places' };
    vi.stubGlobal('google', { maps: { importLibrary: vi.fn(async () => library) } });
    await expect(importMapsLibrary('places')).resolves.toBe(library);
    expect(scripts).toHaveLength(0);
  });
});
