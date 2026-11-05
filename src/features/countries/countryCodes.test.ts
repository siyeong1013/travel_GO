import { describe, expect, it } from 'vitest';
import { COUNTRY_CODES } from '@/features/countries/countryCodes';
import { WORLD_COUNTRIES } from '@/features/countries/worldMap';

describe('COUNTRY_CODES', () => {
  it("are the map's countries", () => {
    expect(COUNTRY_CODES).toEqual(WORLD_COUNTRIES.map(([code]) => code));
  });
});
