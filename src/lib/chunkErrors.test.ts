import { describe, expect, it, vi } from 'vitest';
import { reloadingForChunk, reloadOnChunkError } from '@/lib/chunkErrors';

/**
 * A page whose chunk loads fail on demand. Pages given the same `tab` share its sessionStorage,
 * like a page and the one it reloads into; `tab: null` is a tab with site data blocked.
 */
function fakePage(tab: Map<string, string> | null = new Map()) {
  const location = { reload: vi.fn(), assign: vi.fn() };
  const page = Object.assign(new EventTarget(), { location });
  Object.defineProperty(page, 'sessionStorage', {
    get() {
      if (!tab) throw new DOMException('The operation is insecure.', 'SecurityError');
      return {
        getItem: (key: string) => tab.get(key) ?? null,
        setItem: (key: string, value: string) => void tab.set(key, value),
      };
    },
  });
  const win = page as unknown as Window;
  return {
    win,
    location,
    chunkFails: () => page.dispatchEvent(new Event('vite:preloadError', { cancelable: true })),
    shownFromCache: () =>
      page.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true })),
  };
}

describe('reloadOnChunkError', () => {
  it('reloads into the screen being opened, once', () => {
    const page = fakePage();
    reloadOnChunkError(() => '/settings', page.win);
    expect(reloadingForChunk(page.win)).toBe(false);

    page.chunkFails();
    expect(page.location.assign).toHaveBeenCalledWith('/settings');
    expect(reloadingForChunk(page.win)).toBe(true);
    // More chunks of the same screen failing don't reload again.
    page.chunkFails();
    expect(page.location.assign).toHaveBeenCalledTimes(1);
  });

  it('reloads the screen shown when nothing is being opened', () => {
    const page = fakePage();
    reloadOnChunkError(() => undefined, page.win);
    page.chunkFails();
    expect(page.location.reload).toHaveBeenCalledTimes(1);
  });

  it('leaves it to the error screen when a chunk is still missing right after', () => {
    const tab = new Map<string, string>();
    let now = 1_000_000;
    const first = fakePage(tab);
    reloadOnChunkError(() => '/settings', first.win, () => now);
    first.chunkFails();
    expect(first.location.assign).toHaveBeenCalledTimes(1);

    // The page it reloaded into: the chunk is still missing (offline, a broken update).
    now += 5_000;
    const reloaded = fakePage(tab);
    reloadOnChunkError(() => undefined, reloaded.win, () => now);
    reloaded.chunkFails();
    expect(reloaded.location.reload).not.toHaveBeenCalled();
    expect(reloadingForChunk(reloaded.win)).toBe(false);

    // A later update can reload again.
    now += 10_000;
    reloaded.chunkFails();
    expect(reloaded.location.reload).toHaveBeenCalledTimes(1);
  });

  it("doesn't reload when the tab can't remember having done so", () => {
    const page = fakePage(null);
    reloadOnChunkError(() => '/settings', page.win);
    page.chunkFails();
    expect(page.location.assign).not.toHaveBeenCalled();
    expect(reloadingForChunk(page.win)).toBe(false);
  });

  it('reloads a page that left for a chunk when "back" brings it back from the cache', () => {
    const stayed = fakePage();
    reloadOnChunkError(() => '/settings', stayed.win);
    stayed.shownFromCache();
    expect(stayed.location.reload).not.toHaveBeenCalled();

    const left = fakePage();
    reloadOnChunkError(() => '/settings', left.win);
    left.chunkFails();
    left.shownFromCache();
    expect(left.location.reload).toHaveBeenCalledTimes(1);
  });
});
