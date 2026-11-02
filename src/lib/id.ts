import type { ID } from '@/data/models';

const formatUuid = (hex: string) =>
  `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;

/** Random UUID v4. */
export function newId(): ID {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  // randomUUID only exists in secure contexts (https, localhost). Opening the dev server
  // from a phone via http://192.168.x.x is not one, but getRandomValues still works there.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return formatUuid(Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''));
}

function fnv1a(input: string, seed: number): string {
  let hash = seed;
  for (let i = 0; i < input.length; i++) {
    hash = Math.imul(hash ^ input.charCodeAt(i), 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * The same UUID (version 8, "custom") for the same `name`, on every device. For records that
 * several migrations or imports create independently but must agree on, like a trip's "나".
 * Not cryptographic; just spread enough not to collide with random ids.
 */
export function derivedId(name: string): ID {
  const hex = [0x811c9dc5, 0x050c5d1f, 0x1b873593, 0xcc9e2d51].map((seed) => fnv1a(name, seed)).join('');
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return formatUuid(`${hex.slice(0, 12)}8${hex.slice(13, 16)}${variant}${hex.slice(17)}`);
}
