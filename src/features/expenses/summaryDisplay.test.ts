import { describe, expect, it } from 'vitest';
import type { Expense } from '@/data/models';
import { buildLedger } from '@/data/rules/ledger';
import { categoryRows, dayRows, formatShare } from '@/features/expenses/summaryDisplay';
import { makeCompanion, makeExpense, makeTrip } from '@/test/fixtures';

const trip = makeTrip({ startDate: '2026-11-10', endDate: '2026-11-12' });
const me = makeCompanion({ tripId: trip.id, name: '나', isMe: true, order: 0 });

/** A personal expense of "나" in won. */
const spend = (amount: number, extra: Partial<Expense>) =>
  makeExpense({ tripId: trip.id, payerIds: [me.id], amount, ...extra }, [
    { companionId: me.id, weight: 1, amount },
  ]);

describe('categoryRows', () => {
  it('lists categories with spending, largest first', () => {
    const ledger = buildLedger(
      trip,
      [me],
      [
        spend(30_000, { category: 'food' }),
        spend(10_000, { category: 'transport' }),
        spend(30_000, { category: 'lodging' }),
        spend(20_000, { category: 'food' }),
      ],
      [],
    );
    expect(categoryRows(ledger)).toEqual([
      { category: 'food', total: 50_000, share: 50_000 / 90_000 },
      { category: 'lodging', total: 30_000, share: 30_000 / 90_000 },
      { category: 'transport', total: 10_000, share: 10_000 / 90_000 },
    ]);
  });

  it('formats shares as whole percents', () => {
    expect(formatShare(50_000 / 90_000)).toBe('56%');
    expect(formatShare(1)).toBe('100%');
    expect(formatShare(0.004)).toBe('1% 미만');
  });
});

describe('dayRows', () => {
  it('shows every trip day, and before/after the trip only when there is spending', () => {
    const ledger = buildLedger(
      trip,
      [me],
      [
        spend(300_000, { date: '2026-10-01' }),
        spend(50_000, { date: '2026-10-20' }),
        spend(12_000, { date: '2026-11-11' }),
      ],
      [],
    );
    expect(dayRows(trip, ledger.byDate).map((row) => [row.key, row.title, row.subtitle, row.total])).toEqual([
      ['before', '여행 전', null, 350_000],
      ['2026-11-10', 'Day 1', '11.10 (화)', 0],
      ['2026-11-11', 'Day 2', '11.11 (수)', 12_000],
      ['2026-11-12', 'Day 3', '11.12 (목)', 0],
    ]);
  });
});
