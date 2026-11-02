import type { ID } from '@/data/models';

/** Random UUID v4. */
export function newId(): ID {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  // randomUUID only exists in secure contexts (https, localhost). Opening the dev server
  // from a phone via http://192.168.x.x is not one, but getRandomValues still works there.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
