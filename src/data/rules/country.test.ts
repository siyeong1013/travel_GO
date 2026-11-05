import { describe, expect, it } from 'vitest';
import { countryStamp, isCountryCode } from '@/data/rules/country';

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
