import { describe, expect, it } from 'vitest';
import { participantsFromShares, type SplitParticipant, splitExpense } from '@/data/rules/split';

const people = (...ids: string[]): SplitParticipant[] =>
  ids.map((companionId) => ({ companionId, value: null }));
const amounts = (result: ReturnType<typeof splitExpense>) =>
  result.ok ? result.shares.map((s) => [s.companionId, s.amount]) : result.error;

describe('splitExpense', () => {
  it('splits equally and gives the remainder to the payer', () => {
    expect(amounts(splitExpense(10_000, ['a'], 'equal', people('a', 'b', 'c')))).toEqual([
      ['a', 3334],
      ['b', 3333],
      ['c', 3333],
    ]);
    expect(amounts(splitExpense(10_000, ['c'], 'equal', people('a', 'b', 'c')))).toEqual([
      ['a', 3333],
      ['b', 3333],
      ['c', 3334],
    ]);
  });

  it('gives a non-participating payer a weight-0 share holding only the remainder', () => {
    const result = splitExpense(10_001, ['a'], 'equal', people('b', 'c'));
    expect(result).toEqual({
      ok: true,
      shares: [
        { companionId: 'b', weight: 1, amount: 5000 },
        { companionId: 'c', weight: 1, amount: 5000 },
        { companionId: 'a', weight: 0, amount: 1 },
      ],
    });
    expect(amounts(splitExpense(10_000, ['a'], 'equal', people('b', 'c')))).toEqual([
      ['b', 5000],
      ['c', 5000],
    ]);
  });

  it('with several payers, gives the remainder to the first one sharing', () => {
    expect(amounts(splitExpense(10_000, ['a', 'b'], 'equal', people('b', 'c', 'd')))).toEqual([
      ['b', 3334],
      ['c', 3333],
      ['d', 3333],
    ]);
    // None of them sharing: the first payer holds it alone.
    expect(amounts(splitExpense(10_001, ['a', 'b'], 'equal', people('c', 'd')))).toEqual([
      ['c', 5000],
      ['d', 5000],
      ['a', 1],
    ]);
    // Nobody ticked as paying yet (a form): the first person sharing, so the parts still add up.
    expect(amounts(splitExpense(10_000, [], 'equal', people('c', 'd', 'b')))).toEqual([
      ['c', 3334],
      ['d', 3333],
      ['b', 3333],
    ]);
  });

  it('splits by ratio', () => {
    const participants = [
      { companionId: 'a', value: 2 },
      { companionId: 'b', value: 1 },
    ];
    expect(amounts(splitExpense(10_000, ['a'], 'ratio', participants))).toEqual([
      ['a', 6667],
      ['b', 3333],
    ]);
    expect(amounts(splitExpense(10_000, ['b'], 'ratio', participants))).toEqual([
      ['a', 6666],
      ['b', 3334],
    ]);
  });

  it('takes entered amounts only when they add up to the total', () => {
    const entered = (a: number, b: number) => [
      { companionId: 'a', value: a },
      { companionId: 'b', value: b },
    ];
    expect(amounts(splitExpense(10_000, ['a'], 'amount', entered(7000, 3000)))).toEqual([
      ['a', 7000],
      ['b', 3000],
    ]);
    expect(splitExpense(10_000, ['a'], 'amount', entered(7000, 2000))).toEqual({
      ok: false,
      error: { kind: 'sum_mismatch', difference: 1000 },
    });
    expect(splitExpense(10_000, ['a'], 'amount', entered(7000, 4000))).toEqual({
      ok: false,
      error: { kind: 'sum_mismatch', difference: -1000 },
    });
  });

  it('handles a personal expense (only the payer)', () => {
    expect(amounts(splitExpense(8_000, ['a'], 'equal', people('a')))).toEqual([['a', 8000]]);
  });

  it('rejects empty, duplicate or invalid participants', () => {
    expect(amounts(splitExpense(100, ['a'], 'equal', []))).toEqual({ kind: 'no_participants' });
    expect(amounts(splitExpense(100, ['a'], 'equal', people('a', 'a')))).toEqual({
      kind: 'duplicate_participant',
      companionId: 'a',
    });
    for (const value of [0, 1.5, null, 1001]) {
      expect(amounts(splitExpense(100, ['a'], 'ratio', [{ companionId: 'a', value }]))).toEqual({
        kind: 'invalid_weight',
        companionId: 'a',
      });
    }
    expect(amounts(splitExpense(100, ['a'], 'amount', [{ companionId: 'a', value: -1 }]))).toEqual({
      kind: 'invalid_share_amount',
      companionId: 'a',
    });
  });
});

describe('participantsFromShares', () => {
  it('recovers what was entered, without the payer remainder row', () => {
    const equal = splitExpense(10_001, ['a'], 'equal', people('b', 'c'));
    const ratio = splitExpense(100, ['a'], 'ratio', [{ companionId: 'a', value: 3 }]);
    const amount = splitExpense(100, ['a'], 'amount', [{ companionId: 'b', value: 100 }]);
    if (!equal.ok || !ratio.ok || !amount.ok) throw new Error('unexpected');

    expect(participantsFromShares('equal', equal.shares)).toEqual(people('b', 'c'));
    expect(participantsFromShares('ratio', ratio.shares)).toEqual([{ companionId: 'a', value: 3 }]);
    expect(participantsFromShares('amount', amount.shares)).toEqual([{ companionId: 'b', value: 100 }]);
  });
});
