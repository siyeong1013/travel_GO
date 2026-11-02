import { describe, expect, it } from 'vitest';
import { buildDayTabs, INBOX, resolveDayKey, tabLabel } from '@/features/schedule/dayTabs';
import { makeItem } from '@/test/fixtures';

const trip = { startDate: '2026-11-10', endDate: '2026-11-12' };

describe('buildDayTabs', () => {
  it('has one tab per day, then the inbox, with item counts', () => {
    const items = [
      makeItem({ tripId: 't', date: '2026-11-10' }),
      makeItem({ tripId: 't', date: '2026-11-10', order: 1 }),
      makeItem({ tripId: 't', date: null }),
    ];

    const tabs = buildDayTabs(trip, items);

    expect(tabs.map((tab) => [tab.key, tab.title, tab.subtitle, tab.count])).toEqual([
      ['2026-11-10', 'Day 1', '11.10 (화)', 2],
      ['2026-11-11', 'Day 2', '11.11 (수)', 0],
      ['2026-11-12', 'Day 3', '11.12 (목)', 0],
      [INBOX, '보관함', null, 1],
    ]);
    expect(tabs.map(tabLabel)).toEqual([
      'Day 1 · 11.10 (화)',
      'Day 2 · 11.11 (수)',
      'Day 3 · 11.12 (목)',
      '보관함',
    ]);
  });
});

describe('resolveDayKey', () => {
  it('uses the URL param when it names a tab of the trip', () => {
    expect(resolveDayKey('2026-11-11', trip, '2026-11-02')).toBe('2026-11-11');
    expect(resolveDayKey(INBOX, trip, '2026-11-02')).toBe(INBOX);
  });

  it('otherwise opens today during the trip, or Day 1', () => {
    expect(resolveDayKey(null, trip, '2026-11-11')).toBe('2026-11-11');
    expect(resolveDayKey(null, trip, '2026-11-02')).toBe('2026-11-10');
    expect(resolveDayKey('2026-11-20', trip, '2026-11-02')).toBe('2026-11-10');
    expect(resolveDayKey('garbage', trip, '2026-11-30')).toBe('2026-11-10');
  });
});
