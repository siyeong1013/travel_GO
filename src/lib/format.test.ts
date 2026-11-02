import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateRange,
  formatMoney,
  formatTripLength,
  josa,
  weekday,
} from '@/lib/format';

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
    expect(josa('일정 3개', '과/와')).toBe('일정 3개와');
    expect(josa('철수', '과/와')).toBe('철수와');
    expect(josa('영민', '과/와')).toBe('영민과');
  });

  it('writes won after the number and other currencies as a symbol before it', () => {
    expect(formatMoney(1234567, 'KRW')).toBe('1,234,567원');
    expect(formatMoney(-3000, 'KRW')).toBe('-3,000원');
    expect(formatMoney(1200, 'JPY')).toBe('¥1,200');
    expect(formatMoney(123456, 'USD')).toBe('$1,234.56');
    expect(formatMoney(5, 'EUR')).toBe('€0.05');
    expect(formatMoney(-150, 'TWD')).toBe('-NT$1.50');
  });

  it('describes the trip length as nights and days', () => {
    expect(formatTripLength('2026-11-10', '2026-11-12')).toBe('2박 3일');
    expect(formatTripLength('2026-11-10', '2026-11-10')).toBe('당일치기');
  });
});
