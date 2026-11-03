/**
 * Copies `text` to the clipboard. False when there is no clipboard (outside secure contexts,
 * e.g. http://<LAN IP>) or the browser refuses: offer the text to select instead.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Whether there is a share sheet (phones, and some desktops; secure contexts only). */
export function canShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/**
 * Opens the share sheet with `text`. `failed` when the browser refuses (offer the text to
 * select instead); closing the sheet is `cancelled`.
 */
export async function shareText(text: string): Promise<'shared' | 'cancelled' | 'failed'> {
  try {
    await navigator.share({ text });
    return 'shared';
  } catch (error) {
    return error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}
