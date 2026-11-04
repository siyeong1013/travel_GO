import { describe, expect, it } from 'vitest';
import { coverInitial, coverStyle } from '@/features/trips/tripCover';
import { derivedId } from '@/lib/id';
import { makeTrip, typedCity } from '@/test/fixtures';

const trip = (city: string, title = '여행') => makeTrip({ title, city: typedCity(city) });

describe('trip covers', () => {
  it("are colored by the trip's id: kept whatever the trip is called, and spread across trips", () => {
    const osaka = trip('오사카', '첫 오사카');
    const renamed = { ...osaka, title: '간사이 여행', city: typedCity('교토') };
    expect(coverStyle(renamed)).toEqual(coverStyle(osaka));
    const ids = Array.from({ length: 16 }, (_, i) => derivedId(`trip ${i}`));
    expect(new Set(ids.map((id) => coverStyle({ id }).backgroundColor)).size).toBeGreaterThan(5);
  });

  it("are marked with the city's first letter, else the title's", () => {
    expect(coverInitial(trip('오사카'))).toBe('오');
    expect(coverInitial(trip('istanbul'))).toBe('I');
    expect(coverInitial(trip('', '가족 여행'))).toBe('가');
    expect(coverInitial(trip(' ', ' '))).toBe('?');
  });
});
