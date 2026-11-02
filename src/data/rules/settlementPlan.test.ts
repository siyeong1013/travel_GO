import { describe, expect, it } from 'vitest';
import { planTransfers, type Transfer } from '@/data/rules/settlementPlan';

type Balances = Record<string, number>;

const toList = (balances: Balances) =>
  Object.entries(balances).map(([companionId, balance]) => ({ companionId, balance }));

/** Applies the transfers and checks that everyone ends up even. */
function settles(balances: Balances, transfers: Transfer[]) {
  const left = { ...balances };
  for (const { fromId, toId, amount } of transfers) {
    expect(amount).toBeGreaterThan(0);
    left[fromId]! += amount;
    left[toId]! -= amount;
  }
  return Object.values(left).every((value) => value === 0);
}

describe('planTransfers', () => {
  it('needs nothing when everyone is even', () => {
    expect(planTransfers(toList({ a: 0, b: 0 }))).toEqual([]);
  });

  it('pays the one creditor back', () => {
    expect(planTransfers(toList({ a: 12_000, b: -12_000 }))).toEqual([
      { fromId: 'b', toId: 'a', amount: 12_000 },
    ]);
  });

  it('finds fewer transfers than pairing the largest amounts', () => {
    // Greedy would take 4: C→A 4, D→B 3, E→A 1, E→B 1. Zero-sum groups {B, C} and {A, D, E}: 3.
    const balances = { A: 50_000, B: 40_000, C: -40_000, D: -30_000, E: -20_000 };
    const transfers = planTransfers(toList(balances));

    expect(transfers).toHaveLength(3);
    expect(transfers).toEqual(
      expect.arrayContaining([
        { fromId: 'C', toId: 'B', amount: 40_000 },
        { fromId: 'D', toId: 'A', amount: 30_000 },
        { fromId: 'E', toId: 'A', amount: 20_000 },
      ]),
    );
    expect(settles(balances, transfers)).toBe(true);
  });

  it('settles any balances in at most n − 1 transfers, also beyond the exact limit', () => {
    let seed = 7;
    const random = () => (seed = (seed * 48_271) % 2_147_483_647) / 2_147_483_647;
    for (const size of [2, 5, 8, 12, 15]) {
      for (let round = 0; round < 20; round++) {
        const balances: Balances = {};
        let sum = 0;
        for (let i = 0; i < size - 1; i++) {
          const value = Math.round((random() - 0.5) * 100_000);
          balances[`p${i}`] = value;
          sum += value;
        }
        balances[`p${size - 1}`] = -sum;

        const transfers = planTransfers(toList(balances));
        expect(settles(balances, transfers)).toBe(true);
        expect(transfers.length).toBeLessThanOrEqual(size - 1);
      }
    }
  });

  it('refuses balances that do not add up to zero', () => {
    expect(() => planTransfers(toList({ a: 1, b: 0 }))).toThrow();
  });
});
