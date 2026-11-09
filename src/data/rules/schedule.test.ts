import { describe, expect, it } from 'vitest';
import type { ScheduleItem } from '@/data/models';
import {
  applyChanges,
  compareItems,
  normalizeSchedule,
  planAppend,
  planMove,
  planRemove,
} from '@/data/rules/schedule';
import { makeItem, makeTrip } from '@/test/fixtures';

const NOW = '2026-02-01T00:00:00.000Z';
const DAY1 = '2026-11-10';
const DAY2 = '2026-11-11';

function sampleItems(): ScheduleItem[] {
  return [
    makeItem({ tripId: 't', id: 'a', date: DAY1, order: 0 }),
    makeItem({ tripId: 't', id: 'b', date: DAY1, order: 1 }),
    makeItem({ tripId: 't', id: 'c', date: DAY1, order: 2 }),
    makeItem({ tripId: 't', id: 'x', date: DAY2, order: 0 }),
    makeItem({ tripId: 't', id: 'i', date: null, order: 0 }),
  ];
}

/** Applies `changed` and returns ids per group; also checks orders are 0..n-1. */
function layout(items: ScheduleItem[], changed: ScheduleItem[]): Record<string, string[]> {
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const item of changed) byId.set(item.id, item);

  const groups: Record<string, ScheduleItem[]> = {};
  for (const item of [...byId.values()].sort(compareItems)) {
    (groups[item.date ?? 'inbox'] ??= []).push(item);
  }
  for (const group of Object.values(groups)) {
    expect(group.map((item) => item.order)).toEqual(group.map((_, i) => i));
  }
  return Object.fromEntries(
    Object.entries(groups).map(([key, group]) => [key, group.map((item) => item.id)]),
  );
}

describe('compareItems', () => {
  it('sorts by date with the inbox last, then by order', () => {
    const sorted = sampleItems().reverse().sort(compareItems);
    expect(sorted.map((item) => item.id)).toEqual(['a', 'b', 'c', 'x', 'i']);
  });
});

describe('planMove', () => {
  it('reorders within a day and only touches items that moved', () => {
    const items = sampleItems();
    const changed = planMove(items, 'c', { date: DAY1, index: 1 }, NOW);

    expect(layout(items, changed)[DAY1]).toEqual(['a', 'c', 'b']);
    expect(changed.map((item) => item.id).sort()).toEqual(['b', 'c']);
    expect(changed.every((item) => item.updatedAt === NOW)).toBe(true);
  });

  it('moves between days and renumbers both', () => {
    const items = sampleItems();
    const changed = planMove(items, 'b', { date: DAY2, index: 0 }, NOW);

    expect(layout(items, changed)).toMatchObject({ [DAY1]: ['a', 'c'], [DAY2]: ['b', 'x'] });
  });

  it('moves to and from the inbox, clamping the index', () => {
    const items = sampleItems();
    const toInbox = planMove(items, 'x', { date: null, index: 99 }, NOW);
    expect(layout(items, toInbox)).toEqual({ [DAY1]: ['a', 'b', 'c'], inbox: ['i', 'x'] });

    const fromInbox = planMove(items, 'i', { date: DAY1, index: 0 }, NOW);
    expect(layout(items, fromInbox)[DAY1]).toEqual(['i', 'a', 'b', 'c']);
    expect(layout(items, fromInbox).inbox).toBeUndefined();
  });

  it('returns nothing when the position does not change', () => {
    expect(planMove(sampleItems(), 'b', { date: DAY1, index: 1 }, NOW)).toEqual([]);
  });
});

describe('planAppend / planRemove', () => {
  it('appends a new item at the end of its group', () => {
    const items = sampleItems();
    const item = makeItem({ tripId: 't', id: 'new', date: DAY1, order: 0 });
    const changed = planAppend(items, item, NOW);

    expect(changed).toContainEqual({ ...item, order: 3 });
    expect(layout([...items, item], changed)[DAY1]).toEqual(['a', 'b', 'c', 'new']);
  });

  it('closes the gap left by a removed item', () => {
    const items = sampleItems();
    const changed = planRemove(items, ['a'], NOW);
    const rest = items.filter((item) => item.id !== 'a');

    expect(layout(rest, changed)[DAY1]).toEqual(['b', 'c']);
  });

  it('closes the gaps left by several, in each of their groups', () => {
    const items = sampleItems();
    const changed = planRemove(items, ['b', 'a', 'x', 'nope'], NOW);
    const rest = items.filter((item) => !['a', 'b', 'x'].includes(item.id));

    expect(layout(rest, changed)).toEqual({ [DAY1]: ['c'], inbox: ['i'] });
    expect(changed.map((item) => item.id)).toEqual(['c']);
  });
});

describe('applyChanges', () => {
  it('swaps in changed items and restores display order', () => {
    const items = sampleItems();
    const next = applyChanges(items, planMove(items, 'x', { date: DAY1, index: 0 }, NOW));

    expect(next.map((item) => item.id)).toEqual(['x', 'a', 'b', 'c', 'i']);
    expect(applyChanges(items, [])).toBe(items);
  });
});

describe('normalizeSchedule', () => {
  it('renumbers duplicate orders by createdAt and moves out-of-range items to the inbox', () => {
    const trip = makeTrip({ id: 't', startDate: DAY1, endDate: DAY1 });
    const items = [
      makeItem({ tripId: 't', id: 'late', date: DAY1, order: 0, createdAt: '2026-01-02T00:00:00Z' }),
      makeItem({ tripId: 't', id: 'early', date: DAY1, order: 0, createdAt: '2026-01-01T00:00:00Z' }),
      makeItem({ tripId: 't', id: 'out', date: DAY2, order: 0 }),
      makeItem({ tripId: 't', id: 'i', date: null, order: 5 }),
      makeItem({ tripId: 'orphan', id: 'o', date: DAY2, order: 7 }),
    ];

    const { changed, movedToInbox } = normalizeSchedule([trip], items, NOW);

    expect(movedToInbox).toBe(1);
    expect(changed.some((item) => item.id === 'o')).toBe(false);
    expect(layout(items.slice(0, 4), changed)).toEqual({
      [DAY1]: ['early', 'late'],
      inbox: ['i', 'out'],
    });
  });
});
