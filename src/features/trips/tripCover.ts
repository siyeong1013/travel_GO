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

/** What a trip's cover is named for: its city, or its title without one. */
const coverName = (trip: Pick<Trip, 'title' | 'city'>) => trip.city.name.trim() || trip.title.trim();

/**
 * A trip's cover, where a travel app would show a photo: a gradient picked by the city, so trips
 * to one city look alike.
 */
export function coverStyle(trip: Pick<Trip, 'title' | 'city'>): CSSProperties {
  const [from, to] = COVERS[hash(coverName(trip)) % COVERS.length]!;
  return {
    backgroundColor: from,
    backgroundImage: `radial-gradient(circle at 85% 10%, rgb(255 255 255 / 0.2), transparent 45%), linear-gradient(135deg, ${from}, ${to})`,
  };
}

/** The mark on a small cover: `오` for 오사카, `I` for istanbul. */
export function coverInitial(trip: Pick<Trip, 'title' | 'city'>): string {
  return (Array.from(coverName(trip))[0] ?? '?').toUpperCase();
}

function hash(text: string): number {
  let value = 0;
  for (const char of text) value = (value * 31 + char.codePointAt(0)!) >>> 0;
  return value;
}
