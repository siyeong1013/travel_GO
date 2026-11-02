import { describe, expect, it } from 'vitest';
import {
  blockReason,
  expenseTitle,
  groupExpenses,
  splitSummary,
} from '@/features/expenses/expenseDisplay';
import { makeCompanion, makeExpense, makeTrip } from '@/test/fixtures';

const trip = makeTrip({ startDate: '2026-11-10', endDate: '2026-11-12' });
const me = makeCompanion({ tripId: trip.id, name: '나', isMe: true, order: 0 });
const chulsoo = makeCompanion({ tripId: trip.id, name: '철수', order: 1 });
const younghee = makeCompanion({ tripId: trip.id, name: '영희', order: 2 });
const companions = [me, chulsoo, younghee];

const equalShares = (amount: number, ...people: typeof companions) =>
  people.map((p, i) => ({
    companionId: p.id,
    weight: 1,
    amount: Math.floor(amount / people.length) + (i === 0 ? amount % people.length : 0),
  }));

describe('groupExpenses', () => {
  it('groups by trip day, with before/after the trip at the ends, and totals each', () => {
    const flight = makeExpense(
      { tripId: trip.id, payerId: me.id, amount: 300_000, date: '2026-10-01' },
      equalShares(300_000, me),
    );
    const sushi = makeExpense(
      {
        tripId: trip.id,
        payerId: me.id,
        amount: 1_000,
        currency: 'JPY',
        date: '2026-11-11',
        exchangeRate: { rate: '9.5', quote: 'KRW', source: 'manual', fetchedAt: null },
      },
      equalShares(1_000, me),
    );
    const ramen = makeExpense(
      { tripId: trip.id, payerId: me.id, amount: 12_000, date: '2026-11-11' },
      equalShares(12_000, me),
    );
    const souvenir = makeExpense(
      { tripId: trip.id, payerId: me.id, amount: 5_000, date: '2026-11-13' },
      equalShares(5_000, me),
    );
    // Rate quoted in another currency (e.g. from a backup): listed, but not in the total.
    const stale = makeExpense(
      {
        tripId: trip.id,
        payerId: me.id,
        amount: 500,
        currency: 'JPY',
        date: '2026-11-11',
        exchangeRate: { rate: '0.0067', quote: 'USD', source: 'manual', fetchedAt: null },
      },
      equalShares(500, me),
    );

    const sections = groupExpenses(trip, [souvenir, ramen, sushi, stale, flight]);

    expect(sections.map((s) => [s.key, s.title, s.subtitle, s.total])).toEqual([
      ['before', '여행 전', null, 300_000],
      ['2026-11-11', 'Day 2', '11.11 (수)', 12_000 + 9_500],
      ['after', '여행 후', null, 5_000],
    ]);
    expect(sections[1]!.rows.map((r) => [r.expense.id, r.converted])).toEqual([
      [ramen.id, 12_000],
      [sushi.id, 9_500],
      [stale.id, null],
    ]);
  });
});

describe('splitSummary', () => {
  it('names personal expenses, one-person splits and group splits', () => {
    const personal = makeExpense({ tripId: trip.id, payerId: me.id, amount: 100 }, equalShares(100, me));
    const treat = makeExpense(
      { tripId: trip.id, payerId: me.id, amount: 100 },
      equalShares(100, chulsoo),
    );
    const group = makeExpense(
      { tripId: trip.id, payerId: chulsoo.id, amount: 100, splitMethod: 'ratio' },
      [
        { companionId: me.id, weight: 2, amount: 67 },
        { companionId: chulsoo.id, weight: 1, amount: 33 },
      ],
    );
    // The payer only carries the remainder (weight 0): not a participant.
    const forTwo = makeExpense({ tripId: trip.id, payerId: me.id, amount: 101 }, [
      { companionId: chulsoo.id, weight: 1, amount: 50 },
      { companionId: younghee.id, weight: 1, amount: 50 },
      { companionId: me.id, weight: 0, amount: 1 },
    ]);

    expect(splitSummary(personal, companions)).toBe('개인 지출');
    expect(splitSummary(treat, companions)).toBe('철수 부담');
    expect(splitSummary(group, companions)).toBe('2명 비율');
    expect(splitSummary(forTwo, companions)).toBe('2명 균등');
  });
});

describe('labels', () => {
  it('titles an expense by its memo, else its category', () => {
    expect(expenseTitle({ memo: ' 타코야키 ', category: 'food' })).toBe('타코야키');
    expect(expenseTitle({ memo: '', category: 'transport' })).toBe('교통');
  });

  it('says why an expense keeps someone from being deleted', () => {
    const paid = makeExpense({ tripId: trip.id, payerId: chulsoo.id, amount: 100 }, []);
    const byAmount = makeExpense(
      { tripId: trip.id, payerId: me.id, amount: 100, splitMethod: 'amount' },
      [],
    );
    const alone = makeExpense({ tripId: trip.id, payerId: me.id, amount: 100 }, []);
    expect(blockReason(paid, chulsoo.id)).toBe('payer');
    expect(blockReason(byAmount, chulsoo.id)).toBe('amount');
    expect(blockReason(alone, chulsoo.id)).toBe('only');
  });
});
