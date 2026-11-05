import { describe, expect, it } from 'vitest';
import {
  addMonths,
  dayName,
  monthsBetween,
  monthTitle,
  monthWeeks,
  tapDate,
} from '@/lib/calendar';

describe('months', () => {
  it('count across years', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-05', -17)).toBe('2024-12');
    expect(monthsBetween('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(monthsBetween('2026-11', '2026-11')).toEqual(['2026-11']);
  });

  it('lay out their days in weeks from Sunday', () => {
    // 2026-12-01 is a Tuesday.
    const weeks = monthWeeks('2026-12');
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toEqual([null, null, '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05']);
    expect(weeks[4]).toEqual(['2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', null, null]);
    // February 2026 starts on a Sunday and fills four weeks exactly.
    expect(monthWeeks('2026-02')).toHaveLength(4);
    expect(monthWeeks('2028-02').flat().filter(Boolean)).toHaveLength(29);
  });

  it('are named in Korean', () => {
    expect(monthTitle('2026-12')).toBe('2026년 12월');
    expect(dayName('2026-12-01')).toBe('2026년 12월 1일 화요일');
  });
});

describe('tapDate', () => {
  it('takes the start, then the end', () => {
    const start = tapDate({ start: null, end: null }, '2026-12-01');
    expect(start).toEqual({ start: '2026-12-01', end: null });
    expect(tapDate(start, '2026-12-03')).toEqual({ start: '2026-12-01', end: '2026-12-03' });
  });

  it('takes the start again as the end of a day trip', () => {
    expect(tapDate({ start: '2026-12-01', end: null }, '2026-12-01')).toEqual({
      start: '2026-12-01',
      end: '2026-12-01',
    });
  });

  it('starts over before the start, or once both are picked', () => {
    expect(tapDate({ start: '2026-12-05', end: null }, '2026-12-01')).toEqual({
      start: '2026-12-01',
      end: null,
    });
    expect(tapDate({ start: '2026-12-01', end: '2026-12-03' }, '2026-12-10')).toEqual({
      start: '2026-12-10',
      end: null,
    });
  });
});
