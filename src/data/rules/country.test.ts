import { describe, expect, it } from 'vitest';
import { countryStamp, isCountryCode, tripCountriesToMark } from '@/data/rules/country';

describe('isCountryCode', () => {
  it('takes two capital letters', () => {
    expect(isCountryCode('JP')).toBe(true);
    expect(isCountryCode('XK')).toBe(true);
    for (const code of ['jp', 'JPN', 'J', '', 1, null]) expect(isCountryCode(code)).toBe(false);
  });
});

describe('countryStamp', () => {
  const NOW = '2026-11-06T00:00:00.000Z';

  it('is now, or just after the version this device has when its clock is behind', () => {
    expect(countryStamp(NOW, undefined)).toBe(NOW);
    expect(countryStamp(NOW, '2026-11-05T00:00:00.000Z')).toBe(NOW);
    expect(countryStamp(NOW, '2026-11-07T00:00:00.000Z')).toBe('2026-11-07T00:00:00.001Z');
    expect(countryStamp(NOW, NOW)).toBe('2026-11-06T00:00:00.001Z');
  });
});

describe('tripCountriesToMark', () => {
  const day = (at: string) => at.slice(0, 10);
  const trip = (startDate: string, countries: string[]) => ({ startDate, countries });
  const mark = (id: string, visited: boolean, updatedAt: string) => ({ id, visited, updatedAt });

  it('puts the countries of trips begun on the map', () => {
    const trips = [trip('2026-11-01', ['JP', 'KR']), trip('2026-11-05', ['TW']), trip('2026-12-01', ['VN'])];
    expect(tripCountriesToMark(trips, [], '2026-11-05', day)).toEqual(['JP', 'KR', 'TW']);
    expect(tripCountriesToMark(trips, [mark('JP', true, '2020-01-01T00:00:00.000Z')], '2026-11-05', day)).toEqual([
      'KR',
      'TW',
    ]);
  });

  it('leaves off what was taken off since the trip began, not before', () => {
    const trips = [trip('2026-11-01', ['JP'])];
    const before = mark('JP', false, '2026-10-31T23:00:00.000Z');
    const since = mark('JP', false, '2026-11-01T00:00:00.000Z');
    expect(tripCountriesToMark(trips, [before], '2026-11-05', day)).toEqual(['JP']);
    expect(tripCountriesToMark(trips, [since], '2026-11-05', day)).toEqual([]);
    // A later trip there puts it back.
    expect(tripCountriesToMark([...trips, trip('2026-11-04', ['JP'])], [since], '2026-11-05', day)).toEqual(['JP']);
  });
});
