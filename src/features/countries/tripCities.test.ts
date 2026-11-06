import { describe, expect, it } from 'vitest';
import type { TripCity } from '@/data/models';
import type { RegionMapData } from '@/features/countries/regionMaps';
import { tripCities } from '@/features/countries/tripCities';

describe('tripCities', () => {
  const map = (cities: RegionMapData['cities']): RegionMapData => ({ width: 100, height: 100, regions: [], cities });
  // The biggest built-up areas first, as the map files have them.
  const maps = new Map<string, RegionMapData | null>([
    ['JP', map([['도쿄', 'JP-13', 1, 1, 'M0 0Z'], ['오사카', 'JP-27', 2, 2, 'M0 0Z'], ['삿포로', 'JP-01', 3, 3, 'M0 0Z']])],
    ['VN', map([['나트랑', 'VN-34', 1, 1, 'M0 0Z', ['냐짱']]])],
    ['TH', map([['푸껫', 'TH-83', 1, 1, '']])],
    ['KR', map([['광주', 'KR-29', 1, 1, 'M0 0Z'], ['광주', 'KR-41', 2, 2, '']])],
    ['FR', map([['파리', 'FR-IDF', 1, 1, 'M0 0Z']])],
    ['IT', map([['바리', 'IT-75', 1, 1, '']])],
    ['AU', null],
  ]);
  const city = (name: string): TripCity => ({ name, placeId: null, location: null, fetchedAt: null });
  const citiesOf = (countries: string[], ...names: string[]) =>
    tripCities({ countries, cities: names.map(city) }, maps);

  it('finds each city on its countries’ maps, by any of its names', () => {
    expect(citiesOf(['JP'], '오사카', '삿포로시')).toEqual(['JP-27:오사카', 'JP-01:삿포로']);
    expect(citiesOf(['JP'], '오사카', '오사카시')).toEqual(['JP-27:오사카']);
    expect(citiesOf(['VN'], '냐짱')).toEqual(['VN-34:나트랑']);
  });

  it('takes the better known city of a name, and one written so before one that sounds so', () => {
    expect(citiesOf(['KR'], '광주')).toEqual(['KR-29:광주']);
    expect(citiesOf(['TH'], '푸켓')).toEqual(['TH-83:푸껫']);
    // Not 바리 too.
    expect(citiesOf(['FR', 'IT'], '파리')).toEqual(['FR-IDF:파리']);
  });

  it('finds none for a region, a name no city has, or a country whose map didn’t come', () => {
    expect(citiesOf(['JP'], '홋카이도', '아틀란티스')).toEqual([]);
    expect(citiesOf(['AU'], '시드니')).toEqual([]);
    expect(citiesOf([], '오사카')).toEqual([]);
  });
});
