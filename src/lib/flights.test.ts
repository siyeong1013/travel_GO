import { describe, expect, it } from 'vitest';
import { parseFlightNumber } from '@/lib/flights';

describe('parseFlightNumber', () => {
  it('reads flight numbers as people type them', () => {
    expect(parseFlightNumber('KE723')).toBe('KE723');
    expect(parseFlightNumber(' ke 723 ')).toBe('KE723');
    expect(parseFlightNumber('7C1301')).toBe('7C1301');
    expect(parseFlightNumber('KAL723')).toBe('KAL723');
  });

  it('leaves places alone', () => {
    for (const text of ['오사카성', 'Osaka', '1234', '12 34', 'KE', 'KE 72345', '']) {
      expect(parseFlightNumber(text), text).toBeNull();
    }
  });
});
