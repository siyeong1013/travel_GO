import { REGION_COUNTS } from '@/features/countries/regionCountries';

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
