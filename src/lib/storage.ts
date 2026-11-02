export type PersistStatus = 'persisted' | 'not-persisted' | 'unsupported';

/**
 * Asks the browser not to evict our IndexedDB data under storage pressure.
 * Chrome decides silently (installed PWAs usually get it), Firefox shows a prompt,
 * and it is unavailable outside secure contexts (e.g. http://<LAN IP>).
 */
export async function requestPersistentStorage(): Promise<PersistStatus> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return 'unsupported';
  try {
    if (await navigator.storage.persisted()) return 'persisted';
    return (await navigator.storage.persist()) ? 'persisted' : 'not-persisted';
  } catch {
    return 'not-persisted';
  }
}
