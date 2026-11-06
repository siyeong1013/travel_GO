import { cityCode } from '@/data/rules/country';
import { REGION_COUNTS } from '@/features/countries/regionCountries';
import { firstFound, keyOf, matchRank, searchTries } from '@/features/countries/searchKey';

/** A region: its code (`JP-27`), Korean name, outline, and a dot for one too small to see. */
export type RegionRow =
  | readonly [code: string, name: string, path: string]
  | readonly [code: string, name: string, path: string, dotX: number, dotY: number];

/**
 * A city (or sight) of a country's map: its name, where it is listed (its region, or the country
 * when in none), where it is on the map (null off it: an overseas region), its built-up area (''
 * for one too small to draw, or without one), and other names it goes by (냐짱 for 나트랑).
 */
export type CityRow =
  | readonly [name: string, where: string, x: number | null, y: number | null, area: string]
  | readonly [
      name: string,
      where: string,
      x: number | null,
      y: number | null,
      area: string,
      aliases: readonly string[],
    ];

/**
 * A country's map, made by scripts/region-maps.mjs: its regions, by name (one without an outline is
 * far from the rest, an overseas one: listed, not drawn), and its cities over them, the biggest
 * built-up areas first (smaller ones are drawn over them; the better known, too).
 */
export interface RegionMapData {
  width: number;
  height: number;
  regions: RegionRow[];
  cities: CityRow[];
}

/** How many regions `country` has on its map; 0 without one. */
export function regionCount(country: string): number {
  return REGION_COUNTS[country] ?? 0;
}

/** The code a city's mark is kept by (`JP-01:삿포로`). */
export function codeOfCity(city: CityRow): string {
  return cityCode(city[1], city[0]);
}

/** A city's names: its own, then the others it goes by. */
export function namesOf(city: CityRow): readonly string[] {
  return city.length === 6 ? [city[0], ...city[5]] : [city[0]];
}

/**
 * The cities with a name that is `query` (any of their names), then that starts with it, then has
 * it; then those in a region named so (홋카이도). The better known first in each. All of them for
 * an empty query.
 */
export function findCities(
  cities: CityRow[],
  regionNames: ReadonlyMap<string, string>,
  query: string,
): CityRow[] {
  const tries = searchTries(query);
  if (tries.length === 0) return cities;
  return firstFound(tries, ({ key, kind }) =>
    cities
      .map((city) => {
        const byName = Math.min(...namesOf(city).map((name) => matchRank(keyOf[kind](name), key)));
        const region = regionNames.get(city[1]);
        return { city, rank: byName < 3 ? byName : 3 + (region ? matchRank(keyOf[kind](region), key) : 3) };
      })
      .filter(({ rank }) => rank < 6)
      .sort((a, b) => a.rank - b.rank)
      .map(({ city }) => city),
  );
}

/**
 * What the map files hold: 2 since they have cities. Asked for by it, so a copy of an older file
 * the service worker kept isn't used.
 */
const MAP_VERSION = 2;

const loading = new Map<string, Promise<RegionMapData>>();

/**
 * The map of `country` (public/regions), fetched when first needed. The service worker keeps the
 * file, so it opens offline afterwards. A failed fetch is tried again next time.
 */
export function loadRegionMap(country: string): Promise<RegionMapData> {
  let map = loading.get(country);
  if (!map) {
    map = fetch(`/regions/${country}.json?v=${MAP_VERSION}`).then(async (response) => {
      if (!response.ok) throw new Error(`region map ${country}: HTTP ${response.status}`);
      const data = (await response.json()) as RegionMapData;
      if (!Array.isArray(data.regions) || !Array.isArray(data.cities)) {
        throw new Error(`region map ${country}: no regions or cities`);
      }
      return data;
    });
    loading.set(country, map);
    map.catch(() => loading.delete(country));
  }
  return map;
}
