import { REGION_COUNTS } from '@/features/countries/regionCountries';
import {
  firstFound,
  keyOf,
  matchRank,
  type SearchTry,
  searchTries,
  writtenKey,
} from '@/features/countries/searchKey';
import type { Places } from '@/features/countries/usePlaces';

/** A region: its code (`JP-27`), Korean name, outline, and a dot for one too small to see. */
export type RegionRow =
  | readonly [code: string, name: string, path: string]
  | readonly [code: string, name: string, path: string, dotX: number, dotY: number];

/**
 * A country's map of its regions, made by scripts/region-maps.mjs. A region without an outline is
 * far from the rest (an overseas one): listed, not drawn.
 */
export interface RegionMapData {
  width: number;
  height: number;
  /** By name. */
  regions: RegionRow[];
}

/** How many regions `country` has on its map; 0 without one. */
export function regionCount(country: string): number {
  return REGION_COUNTS[country] ?? 0;
}

/**
 * The regions whose name, or a place in them (나트랑 in 카인호아성), has `query`: those with a name
 * that is it first, then one that starts with it. All of them for an empty query.
 */
export function findRegions(regions: RegionRow[], places: Places, query: string): RegionRow[] {
  const tries = searchTries(query);
  if (tries.length === 0) return regions;
  return firstFound(tries, ({ key, kind }) =>
    regions
      .map((row) => {
        const names = [row[1], ...(places[row[0]] ?? [])];
        return { row, rank: Math.min(...names.map((name) => matchRank(keyOf[kind](name), key))) };
      })
      .filter(({ rank }) => rank < 3)
      .sort((a, b) => a.rank - b.rank)
      .map(({ row }) => row),
  );
}

/**
 * Which of a region's places to show under its name: the ones `query` finds first, then the best
 * known, up to `count`. Not one the region's name says already (교토 in 교토부).
 */
export function shownPlaces(places: readonly string[], region: string, query: string, count = 4): string[] {
  const own = writtenKey(region);
  const others = places.filter((place) => !own.includes(writtenKey(place)));
  const has = ({ key, kind }: SearchTry, place: string) => keyOf[kind](place).includes(key);
  const hit = searchTries(query).find((one) => others.some((place) => has(one, place)));
  const found = others.filter((place) => hit && has(hit, place));
  return [...found, ...others.filter((place) => !found.includes(place))].slice(0, count);
}

const loading = new Map<string, Promise<RegionMapData>>();

/**
 * The map of `country`'s regions (public/regions), fetched when first needed. The service worker
 * keeps the file, so it opens offline afterwards. A failed fetch is tried again next time.
 */
export function loadRegionMap(country: string): Promise<RegionMapData> {
  let map = loading.get(country);
  if (!map) {
    map = fetch(`/regions/${country}.json`).then(async (response) => {
      if (!response.ok) throw new Error(`region map ${country}: HTTP ${response.status}`);
      const data = (await response.json()) as RegionMapData;
      if (!Array.isArray(data.regions)) throw new Error(`region map ${country}: no regions`);
      return data;
    });
    loading.set(country, map);
    map.catch(() => loading.delete(country));
  }
  return map;
}
