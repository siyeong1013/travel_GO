const RELOADED_AT = 'travel-go:reloaded-for-chunk';
/** A chunk missing again this soon after reloading for one is a real failure (offline, broken update). */
const RETRY_AFTER_MS = 10_000;

/** Pages on their way out: reloading for a missing chunk. */
const reloading = new WeakSet<Window>();

/**
 * Whether the page is already reloading for a missing chunk. A screen whose chunk failed then
 * waits for the new page instead of showing an error (or being added to history) on the way out.
 */
export const reloadingForChunk = (win: Window = window) => reloading.has(win);

/**
 * Screens' code comes in chunks loaded when first opened. A page opened before an update may ask
 * for a chunk the update removed: reload once to get the new version, at `pendingHref()` (the
 * screen being opened) if there is one. When that already happened moments ago (or the tab can't
 * remember it), the error screen shows instead of reloading again.
 */
export function reloadOnChunkError(
  pendingHref: () => string | undefined,
  win: Window = window,
  now: () => number = Date.now,
) {
  win.addEventListener('vite:preloadError', () => {
    if (reloading.has(win)) return;
    let tab: Storage;
    try {
      tab = win.sessionStorage;
    } catch {
      return; // site data blocked: nothing to stop a reload loop with
    }
    if (now() - Number(tab.getItem(RELOADED_AT)) < RETRY_AFTER_MS) return;
    tab.setItem(RELOADED_AT, String(now()));
    reloading.add(win);
    const href = pendingHref();
    if (href) win.location.assign(href);
    else win.location.reload();
  });

  // "Back" may bring the old page back from the browser's cache, still on the old version.
  win.addEventListener('pageshow', (event) => {
    if ((event as PageTransitionEvent).persisted && reloading.has(win)) win.location.reload();
  });
}
