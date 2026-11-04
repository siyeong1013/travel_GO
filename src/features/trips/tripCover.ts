import type { CSSProperties } from 'react';
import type { Trip } from '@/data/models';

/** Cover gradients (from, to). Both ends keep white text at 4.5:1 or more. */
const COVERS: readonly (readonly [string, string])[] = [
  ['#2563eb', '#4f46e5'], // blue → indigo
  ['#0f766e', '#0e7490'], // teal → cyan
  ['#c2410c', '#be185d'], // orange → pink
  ['#7c3aed', '#a21caf'], // violet → fuchsia
  ['#047857', '#0f766e'], // emerald → teal
  ['#b91c1c', '#c2410c'], // red → orange
  ['#0369a1', '#2563eb'], // sky → blue
  ['#a16207', '#c2410c'], // amber → orange
];

/**
 * A trip's cover when it has no photo: a gradient picked by the trip's id. So each trip gets one
 * at random and keeps it, whatever it's called (on every device, and through backups).
 */
export function coverStyle(trip: Pick<Trip, 'id'>): CSSProperties {
  const [from, to] = COVERS[hash(trip.id) % COVERS.length]!;
  return {
    backgroundColor: from,
    backgroundImage: `radial-gradient(circle at 85% 10%, rgb(255 255 255 / 0.2), transparent 45%), linear-gradient(135deg, ${from}, ${to})`,
  };
}

/** The mark on a small cover: `오` for 오사카, `I` for istanbul (the title's without a city). */
export function coverInitial(trip: Pick<Trip, 'title' | 'city'>): string {
  const name = trip.city.name.trim() || trip.title.trim();
  return (Array.from(name)[0] ?? '?').toUpperCase();
}

function hash(text: string): number {
  let value = 0;
  for (const char of text) value = (value * 31 + char.codePointAt(0)!) >>> 0;
  return value;
}

/**
 * Shade behind the white text on a photo, for a box with `pt-16` above its text: clear at the
 * top, dark from where the text starts. White text on a white photo needs about 0.55 black behind
 * it (4.5:1).
 */
export const photoTextShade: CSSProperties = {
  backgroundImage:
    'linear-gradient(to top, rgb(0 0 0 / 0.7), rgb(0 0 0 / 0.55) calc(100% - 4rem), rgb(0 0 0 / 0.2) calc(100% - 2rem), transparent)',
};

/** Colors of the badge saying how soon the trip is: see-through on a color, white on a photo (any photo). */
export const coverBadgeClass = (onPhoto: boolean) =>
  onPhoto ? 'bg-white/90 text-gray-900' : 'bg-white/20';
