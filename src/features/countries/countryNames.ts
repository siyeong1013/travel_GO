import { COUNTRY_CODES } from '@/features/countries/countryCodes';
import { firstFound, keyOf, matchRank, searchTries, soundKey, writtenKey } from '@/features/countries/searchKey';
import type { Places } from '@/features/countries/usePlaces';

// Shorter than the locale data's, or how people say them.
const NAMES: Record<string, string> = {
  HK: '홍콩',
  MO: '마카오',
  PS: '팔레스타인',
  MP: '북마리아나 제도',
  VA: '바티칸',
};

// Parts of a country on the map that people look for as if they were one (cities are in places.ts).
const ALSO_CALLED: Record<string, string[]> = {
  MP: ['사이판'],
  US: ['하와이', '알래스카'],
  ID: ['발리'],
  GB: ['잉글랜드', '스코틀랜드'],
};

let korean: Intl.DisplayNames | null | undefined;
let english: Intl.DisplayNames | null | undefined;

function displayNames(locale: string): Intl.DisplayNames | null {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' });
  } catch {
    return null;
  }
}

/** `일본`, from the device's locale data (`JP` when it has none). */
export function countryName(code: string): string {
  korean ??= displayNames('ko');
  return NAMES[code] ?? korean?.of(code) ?? code;
}

function englishName(code: string): string {
  english ??= displayNames('en');
  return english?.of(code) ?? code;
}

/** The flag emoji of a country code (`🇯🇵`). */
export function flagOf(code: string): string {
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** A country a search found. */
export interface CountryMatch {
  code: string;
  /** The places in it that have the query, best first, when its names don't (파리 for 프랑스). */
  places: string[];
}

interface Hit extends CountryMatch {
  rank: number;
  byPlace: boolean;
  /** Where the place is in its region's list: the better known first. */
  at: number;
}

interface KeyedPlace {
  country: string;
  name: string;
  written: string;
  sound: string;
  at: number;
}

const keyed = new WeakMap<Places, KeyedPlace[]>();

/** Every place with its country and keys, worked out once. */
function keyedPlaces(places: Places): KeyedPlace[] {
  let list = keyed.get(places);
  if (!list) {
    list = Object.entries(places).flatMap(([code, names]) =>
      names.map((name, at) => ({ country: code.slice(0, 2), name, written: writtenKey(name), sound: soundKey(name), at })),
    );
    keyed.set(places, list);
  }
  return list;
}

/**
 * Countries whose name (Korean or English), another name people use (사이판), code, or one of
 * `places` in them (파리) has `query`: those with a name that is it first, then one that starts
 * with it; by their own names before by a place, then by the better known place, then by name.
 */
export function searchCountries(query: string, places: Places = {}): CountryMatch[] {
  return firstFound(searchTries(query), ({ key, kind }) => {
    const hits = new Map<string, Hit>();
    for (const code of COUNTRY_CODES) {
      const names = [countryName(code), englishName(code), code, ...(ALSO_CALLED[code] ?? [])];
      const rank = Math.min(...names.map((name) => matchRank(keyOf[kind](name), key)));
      if (rank < 3) hits.set(code, { code, places: [], rank, byPlace: false, at: 0 });
    }
    const found = keyedPlaces(places)
      .map((place) => ({ ...place, rank: matchRank(place[kind], key) }))
      .filter((place) => place.rank < 3 && !hits.has(place.country))
      .sort((a, b) => a.rank - b.rank || a.at - b.at);
    for (const { country, name, rank, at } of found) {
      const hit = hits.get(country);
      if (!hit) hits.set(country, { code: country, places: [name], rank, byPlace: true, at });
      else if (hit.places.length < 3 && !hit.places.includes(name)) hit.places.push(name);
    }
    return [...hits.values()]
      .sort(
        (a, b) =>
          a.rank - b.rank ||
          Number(a.byPlace) - Number(b.byPlace) ||
          a.at - b.at ||
          countryName(a.code).localeCompare(countryName(b.code), 'ko'),
      )
      .map(({ code, places: found }) => ({ code, places: found }));
  });
}

/** `codes` by their Korean names. */
export function byName(codes: string[]): string[] {
  return [...codes].sort((a, b) => countryName(a).localeCompare(countryName(b), 'ko'));
}
