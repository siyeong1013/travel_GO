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

export type ShareResult = 'shared' | 'cancelled' | 'failed';

/**
 * Opens the share sheet with `text`. `failed` when the browser refuses (offer the text to
 * select instead); closing the sheet is `cancelled`.
 */
export function shareText(text: string): Promise<ShareResult> {
  return share({ text });
}

/**
 * Whether the share sheet takes `file`. Safari takes any file; Chrome only some types (not
 * JSON), so save with a download there.
 */
export function canShareFile(file: File): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  );
}

/** Opens the share sheet with `file` (to save it in Files, or send it to oneself). */
export function shareFile(file: File): Promise<ShareResult> {
  return share({ files: [file] });
}

async function share(data: ShareData): Promise<ShareResult> {
  try {
    await navigator.share(data);
    return 'shared';
  } catch (error) {
    return error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}
