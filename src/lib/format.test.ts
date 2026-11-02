import { describe, expect, it } from 'vitest';
import { formatDate, formatDateRange, formatTripLength, weekday } from '@/lib/format';

const TODAY = '2026-11-02';

describe('format', () => {
  it('uses Korean weekdays', () => {
    expect(weekday('2026-11-02')).toBe('월');
    expect(formatDate('2026-11-10')).toBe('11.10 (화)');
    expect(formatDate('2027-01-03', true)).toBe('2027.1.3 (일)');
  });

  it('shows a year only when it changes', () => {
    expect(formatDateRange('2026-11-10', '2026-11-12', TODAY)).toBe('11.10 (화) – 11.12 (목)');
    expect(formatDateRange('2027-01-03', '2027-01-05', TODAY)).toBe('2027.1.3 (일) – 1.5 (화)');
    expect(formatDateRange('2026-12-30', '2027-01-02', TODAY)).toBe('12.30 (수) – 2027.1.2 (토)');
    expect(formatDateRange('2026-11-10', '2026-11-10', TODAY)).toBe('11.10 (화)');
  });

  it('describes the trip length as nights and days', () => {
    expect(formatTripLength('2026-11-10', '2026-11-12')).toBe('2박 3일');
    expect(formatTripLength('2026-11-10', '2026-11-10')).toBe('당일치기');
  });
});
