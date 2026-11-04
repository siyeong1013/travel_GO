/** From the start of the page load: long enough to be seen, not just flash. */
const MIN_SHOWN_MS = 900;
/** The fade in index.html (`#splash` transition). */
const FADE_MS = 300;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Fades out the start screen that index.html draws before the app's code runs, then removes it.
 * Called once the app has drawn; a second call (StrictMode runs effects twice) does nothing.
 */
export async function hideSplash(
  doc: Document = document,
  elapsedMs: number = performance.now(),
  wait: (ms: number) => Promise<void> = sleep,
): Promise<void> {
  const splash = doc.getElementById('splash');
  if (!splash || splash.dataset.hiding !== undefined) return;
  splash.dataset.hiding = '';
  await wait(Math.max(0, MIN_SHOWN_MS - elapsedMs));
  splash.classList.add('splash-hidden');
  await wait(FADE_MS);
  splash.remove();
}
