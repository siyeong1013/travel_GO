import { describe, expect, it } from 'vitest';
import type { Expense, Settlement } from '@/data/models';
import { buildLedger, convertExpense } from '@/data/rules/ledger';
import { splitExpense } from '@/data/rules/split';
import { makeCompanion, makeExpense, T0 } from '@/test/fixtures';

const trip = { settlementCurrency: 'KRW', budget: 50_000 };
const me = makeCompanion({ id: 'me', tripId: 't', name: '나', isMe: true, order: 0 });
const a = makeCompanion({ id: 'a', tripId: 't', name: '철수', order: 1 });
const b = makeCompanion({ id: 'b', tripId: 't', name: '영희', order: 2 });

/** Paid by one person (or several, in equal parts), split equally. */
function expense(
  payers: string | string[],
  amount: number,
  participantIds: string[],
  extra: Partial<Expense> = {},
) {
  const payerIds = typeof payers === 'string' ? [payers] : payers;
  const split = splitExpense(
    amount,
    payerIds,
    'equal',
    participantIds.map((companionId) => ({ companionId, value: null })),
  );
  if (!split.ok) throw new Error('bad split');
  return makeExpense({ tripId: 't', payerIds, amount, ...extra }, split.shares);
}

const settlement = (fromId: string, toId: string, amount: number): Settlement => ({
  id: `${fromId}-${toId}`,
  tripId: 't',
  fromId,
  toId,
  amount,
  currency: 'KRW',
  createdAt: T0,
  updatedAt: T0,
});

const balancesOf = (ledger: ReturnType<typeof buildLedger>) =>
  Object.fromEntries(ledger.balances.map((entry) => [entry.companionId, entry.balance]));

describe('convertExpense', () => {
  it('converts once, splits in proportion, and the parts add up exactly', () => {
    // ¥1,001 × 9.0412 = 9,050.24 → 9,050원. Shares ¥335 (payer, with remainder), ¥333, ¥333.
    const converted = convertExpense(
      expense('me', 1001, ['me', 'a', 'b'], {
        currency: 'JPY',
        exchangeRate: { rate: '9.0412', quote: 'KRW', source: 'manual', fetchedAt: null },
      }),
      'KRW',
    )!;

    expect(converted.total).toBe(9050);
    expect(Object.fromEntries(converted.owed)).toEqual({ me: 3030, a: 3010, b: 3010 });
  });

  it('divides what was paid equally among several payers, the remainder on the one sharing', () => {
    const converted = convertExpense(expense(['a', 'me'], 10_001, ['me', 'b']), 'KRW')!;
    expect(Object.fromEntries(converted.paid)).toEqual({ a: 5000, me: 5001 });
    expect(Object.fromEntries(converted.owed)).toEqual({ me: 5001, b: 5000 });
  });

  it('cannot convert with a rate for another currency', () => {
    const usdRate = expense('me', 1000, ['me'], {
      currency: 'JPY',
      exchangeRate: { rate: '0.0064', quote: 'USD', source: 'api', fetchedAt: T0 },
    });
    expect(convertExpense(usdRate, 'KRW')).toBeNull();
  });
});

describe('buildLedger', () => {
  it('leaves nothing owed when one paid and the other gave them half: both paid', () => {
    const ledger = buildLedger(trip, [me, a], [expense(['me', 'a'], 1_000_000, ['me', 'a'])], []);
    expect(ledger.balances.map(({ paid, spent, balance }) => [paid, spent, balance])).toEqual([
      [500_000, 500_000, 0],
      [500_000, 500_000, 0],
    ]);
  });

  it('totals by category and date, and balances add up to zero', () => {
    const ledger = buildLedger(
      trip,
      [b, a, me],
      [
        expense('me', 30_000, ['me', 'a', 'b'], { category: 'food', date: '2026-11-10' }),
        expense('a', 1000, ['a', 'b'], {
          category: 'transport',
          date: '2026-11-11',
          currency: 'JPY',
          exchangeRate: { rate: '9.5', quote: 'KRW', source: 'api', fetchedAt: T0 },
        }),
      ],
      [],
    );

    expect(ledger.total).toBe(39_500);
    expect(ledger.remaining).toBe(10_500);
    expect(ledger.byCategory).toMatchObject({ food: 30_000, transport: 9_500, lodging: 0 });
    expect(ledger.byDate).toEqual([
      { date: '2026-11-10', total: 30_000 },
      { date: '2026-11-11', total: 9_500 },
    ]);
    expect(ledger.balances.map((entry) => entry.companionId)).toEqual(['me', 'a', 'b']);
    expect(ledger.balances.find((entry) => entry.companionId === 'a')).toMatchObject({
      paid: 9_500,
      spent: 10_000 + 4_750,
    });
    expect(balancesOf(ledger)).toEqual({ me: 20_000, a: -5_250, b: -14_750 });
  });

  it('counts recorded transfers', () => {
    const ledger = buildLedger(
      trip,
      [me, a, b],
      [expense('me', 30_000, ['me', 'a', 'b'])],
      [settlement('b', 'me', 10_000)],
    );
    expect(balancesOf(ledger)).toEqual({ me: 10_000, a: -10_000, b: 0 });
  });

  it('keeps a personal expense out of the balances', () => {
    const ledger = buildLedger(trip, [me, a], [expense('a', 12_000, ['a'])], []);
    expect(ledger.total).toBe(12_000);
    expect(balancesOf(ledger)).toEqual({ me: 0, a: 0 });
  });

  it('leaves out expenses whose rate is for another currency, and says so', () => {
    const stray = expense('me', 1000, ['me', 'a'], {
      currency: 'JPY',
      exchangeRate: { rate: '0.0064', quote: 'USD', source: 'api', fetchedAt: T0 },
    });
    const ledger = buildLedger(trip, [me, a], [stray], []);
    expect(ledger.total).toBe(0);
    expect(ledger.unconvertible).toEqual([stray.id]);
  });
});
