/** The device's localStorage; undefined when unavailable (Node, blocked site data). */
export function deviceStorage(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined; // reading it throws when site data is blocked
  }
}
