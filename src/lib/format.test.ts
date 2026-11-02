import { describe, expect, it } from 'vitest';
import { formatDate, formatDateRange, formatTripLength, josa, weekday } from '@/lib/format';

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

  it('picks the particle that fits the last sound', () => {
    expect(josa('도톤보리', '을/를')).toBe('도톤보리를');
    expect(josa('오사카성', '을/를')).toBe('오사카성을');
    expect(josa('보관함', '으로/로')).toBe('보관함으로');
    expect(josa('서울', '으로/로')).toBe('서울로');
    expect(josa('Day 1', '으로/로')).toBe('Day 1로');
    expect(josa('Day 3', '으로/로')).toBe('Day 3으로');
    expect(josa('Day 10', '으로/로')).toBe('Day 10으로');
    expect(josa('Day 2', '은/는')).toBe('Day 2는');
    expect(josa('USJ', '을/를')).toBe('USJ을(를)');
  });

  it('describes the trip length as nights and days', () => {
    expect(formatTripLength('2026-11-10', '2026-11-12')).toBe('2박 3일');
    expect(formatTripLength('2026-11-10', '2026-11-10')).toBe('당일치기');
  });
});
