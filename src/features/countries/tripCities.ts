import type { Trip } from '@/data/models';
import { codeOfCity, type CityRow, namesOf, type RegionMapData } from '@/features/countries/regionMaps';
import {
  firstFound,
  type KeyKind,
  searchTries,
  shortName,
  soundKey,
  writtenKey,
} from '@/features/countries/searchKey';

interface KeyedCity {
  city: CityRow;
  /** Its names' keys, as they are and without the word for a city (삿포로시 → 삿포로). */
  keys: Record<KeyKind, string[]>;
}

const keyed = new WeakMap<RegionMapData, KeyedCity[]>();

/** A map's cities with their keys, worked out once. */
function citiesOf(map: RegionMapData): KeyedCity[] {
  let list = keyed.get(map);
  if (!list) {
    list = map.cities.map((city) => {
      const texts = namesOf(city).flatMap((name) => [name, shortName(name)]);
      return { city, keys: { written: texts.map(writtenKey), sound: texts.map(soundKey) } };
    });
    keyed.set(map, list);
  }
  return list;
}

/**
 * The cities of a trip's countries' maps that its cities are (오사카 → `JP-27:오사카`, 냐짱 →
 * `VN-34:나트랑`): of those named as a city, the better known (the bigger built-up area); as
 * written before as it sounds, as search does. None for a name no city there has (홋카이도: a
 * region), or in a country whose map isn't in `maps`.
 */
export function tripCities(
  trip: Pick<Trip, 'countries' | 'cities'>,
  maps: ReadonlyMap<string, RegionMapData | null>,
): string[] {
  const candidates = trip.countries.flatMap((country) => {
    const map = maps.get(country);
    return map ? citiesOf(map) : [];
  });
  const found = new Set<string>();
  for (const { name } of trip.cities) {
    const [best] = firstFound(searchTries(name), ({ key, kind }) =>
      candidates.filter((candidate) => candidate.keys[kind].includes(key)),
    );
    if (best) found.add(codeOfCity(best.city));
  }
  return [...found];
}
