import { describe, expect, it } from 'vitest';
import { codeOfCity, type CityRow, findCities, namesOf } from '@/features/countries/regionMaps';

describe('codeOfCity', () => {
  it('is where the city is listed and its name; its other names find it', () => {
    const city: CityRow = ['나트랑', 'VN-34', 10, 10, '', ['냐짱']];
    expect(codeOfCity(city)).toBe('VN-34:나트랑');
    expect(namesOf(city)).toEqual(['나트랑', '냐짱']);
  });
});

describe('findCities', () => {
  // The biggest built-up areas first, as the map files have them.
  const cities: CityRow[] = [
    ['호찌민', 'VN-SG', 10, 10, 'M0 0L1 0L1 1Z'],
    ['나트랑', 'VN-34', 20, 20, 'M0 0L1 0L1 1Z', ['냐짱']],
    ['다낭', 'VN-DN', 30, 30, ''],
    ['호이안', 'VN-27', 40, 40, ''],
    ['깜라인', 'VN-34', 50, 50, ''],
  ];
  const regions = new Map([
    ['VN-SG', '호찌민시'],
    ['VN-34', '카인호아성'],
    ['VN-DN', '다낭'],
    ['VN-27', '꽝남성'],
  ]);
  const find = (query: string) => findCities(cities, regions, query).map(([name]) => name);

  it('finds them all for nothing, the better known first', () => {
    expect(find('')).toEqual(['호찌민', '나트랑', '다낭', '호이안', '깜라인']);
  });

  it('finds a city by any of its names, and as it sounds', () => {
    expect(find('냐짱')).toEqual(['나트랑']);
    expect(find('호이')).toEqual(['호이안']);
    expect(find('호치민')).toEqual(['호찌민']);
  });

  it('finds the cities of a region by its name, after one named so', () => {
    expect(find('카인호아')).toEqual(['나트랑', '깜라인']);
    expect(find('다낭')).toEqual(['다낭']);
  });

  it('puts a name that is the query first, then one starting with it, then having it, then a region', () => {
    const rows: CityRow[] = [
      ['코스트로마', 'RU-KOS', 1, 1, ''],
      ['로마냐노', 'IT-21', 2, 2, ''],
      ['로마', 'IT-62', 3, 3, ''],
      ['볼로냐', 'IT-45', 4, 4, ''],
    ];
    const names = new Map([['IT-45', '에밀리아로마냐']]);
    expect(findCities(rows, names, '로마').map(([name]) => name)).toEqual(['로마', '로마냐노', '코스트로마', '볼로냐']);
  });
});
