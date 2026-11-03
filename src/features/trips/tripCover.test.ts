import { describe, expect, it } from 'vitest';
import { coverInitial, coverStyle } from '@/features/trips/tripCover';
import { makeTrip, typedCity } from '@/test/fixtures';

const trip = (city: string, title = '여행') => makeTrip({ title, city: typedCity(city) });

describe('trip covers', () => {
  it('look alike for trips to one city, and differ between cities', () => {
    expect(coverStyle(trip('오사카', '첫 오사카'))).toEqual(coverStyle(trip('오사카', '또 오사카')));
    const cities = ['오사카', '도쿄', '파리', '방콕', '다낭', '제주', '런던', 'Istanbul'];
    expect(new Set(cities.map((city) => coverStyle(trip(city)).backgroundColor)).size).toBeGreaterThan(3);
  });

  it("are marked with the city's first letter, else the title's", () => {
    expect(coverInitial(trip('오사카'))).toBe('오');
    expect(coverInitial(trip('istanbul'))).toBe('I');
    expect(coverInitial(trip('', '가족 여행'))).toBe('가');
    expect(coverInitial(trip(' ', ' '))).toBe('?');
  });
});
