import { describe, expect, it } from 'vitest';
import {
  addDays,
  diffDays,
  eachDateInRange,
  isDateInRange,
  isLocalDate,
  isLocalTime,
  toLocalDate,
} from '@/lib/dates';

describe('isLocalDate', () => {
  it('accepts real calendar dates', () => {
    expect(isLocalDate('2026-11-02')).toBe(true);
    expect(isLocalDate('2028-02-29')).toBe(true);
  });

  it('rejects malformed or impossible dates', () => {
    for (const value of ['2026-02-29', '2026-13-01', '2026-1-2', '2026-11-02T00:00', '', 20261102, null]) {
      expect(isLocalDate(value), String(value)).toBe(false);
    }
  });
});

describe('isLocalTime', () => {
  it('accepts HH:mm only', () => {
    expect(isLocalTime('00:00')).toBe(true);
    expect(isLocalTime('23:59')).toBe(true);
    for (const value of ['24:00', '9:30', '09:60', '09:30:00', '']) {
      expect(isLocalTime(value), value).toBe(false);
    }
  });
});

describe('date arithmetic', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-11-02', '2026-11-05')).toBe(3);
    expect(diffDays('2026-11-05', '2026-11-02')).toBe(-3);
  });

  it('lists every date of an inclusive range', () => {
    expect(eachDateInRange('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
    expect(eachDateInRange('2026-11-02', '2026-11-02')).toEqual(['2026-11-02']);
    expect(eachDateInRange('2026-11-03', '2026-11-02')).toEqual([]);
  });

  it('checks range membership inclusively', () => {
    expect(isDateInRange('2026-11-10', '2026-11-10', '2026-11-12')).toBe(true);
    expect(isDateInRange('2026-11-12', '2026-11-10', '2026-11-12')).toBe(true);
    expect(isDateInRange('2026-11-13', '2026-11-10', '2026-11-12')).toBe(false);
  });

  it('formats the device-local calendar date', () => {
    expect(toLocalDate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});
