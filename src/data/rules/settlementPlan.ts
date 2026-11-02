import type { ID } from '@/data/models';

export interface Transfer {
  fromId: ID;
  toId: ID;
  amount: number;
}

interface Person {
  companionId: ID;
  balance: number;
  /** Position in the input, for a stable order. */
  index: number;
}

/** Above this many non-zero balances the exact search (2^n subsets) gives way to greedy. */
const EXACT_LIMIT = 12;

/**
 * The fewest transfers that bring every balance to zero (balances must add up to 0).
 * Up to 12 non-zero balances it is exact: the people are split into as many zero-sum groups
 * as possible, and a group of k settles with k − 1 transfers. Beyond that, greedy.
 */
export function planTransfers(balances: { companionId: ID; balance: number }[]): Transfer[] {
  const people = balances
    .map(({ companionId, balance }, index) => ({ companionId, balance, index }))
    .filter((person) => person.balance !== 0);
  if (people.reduce((sum, person) => sum + person.balance, 0) !== 0) {
    throw new Error('balances must add up to 0');
  }
  if (people.length === 0) return [];
  const groups = people.length <= EXACT_LIMIT ? zeroSumGroups(people) : [people];
  return groups.flatMap(settleGreedily);
}

function zeroSumGroups(people: Person[]): Person[][] {
  const n = people.length;
  const full = (1 << n) - 1;
  const sum = new Array<number>(full + 1).fill(0);
  for (let mask = 1; mask <= full; mask++) {
    const lowest = mask & -mask;
    sum[mask] = sum[mask ^ lowest]! + people[31 - Math.clz32(lowest)]!.balance;
  }

  // best[mask]: how many zero-sum sets a chain of single removals from `mask` can pass through.
  const best = new Array<number>(full + 1).fill(0);
  for (let mask = 1; mask <= full; mask++) {
    let most = 0;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) most = Math.max(most, best[mask ^ (1 << i)]!);
    }
    best[mask] = most + (sum[mask] === 0 ? 1 : 0);
  }

  // Follow a best chain down from everyone; consecutive zero-sum sets differ by a zero-sum group.
  const zeroSets: number[] = [];
  let mask = full;
  while (mask) {
    const isZero = sum[mask] === 0;
    if (isZero) zeroSets.push(mask);
    const target = best[mask]! - (isZero ? 1 : 0);
    let i = 0;
    while (!(mask & (1 << i)) || best[mask ^ (1 << i)] !== target) i++;
    mask ^= 1 << i;
  }
  zeroSets.push(0);

  return zeroSets.slice(0, -1).map((set, k) => {
    const group = set & ~zeroSets[k + 1]!;
    return people.filter((_, i) => group & (1 << i));
  });
}

/** Largest debtor pays largest creditor until everyone is even: at most k − 1 transfers. */
function settleGreedily(group: Person[]): Transfer[] {
  const byAmount = (a: Person, b: Person) => b.balance - a.balance || a.index - b.index;
  const creditors = group.filter((p) => p.balance > 0).map((p) => ({ ...p }));
  const debtors = group.filter((p) => p.balance < 0).map((p) => ({ ...p, balance: -p.balance }));
  const transfers: Transfer[] = [];

  while (creditors.length > 0 && debtors.length > 0) {
    creditors.sort(byAmount);
    debtors.sort(byAmount);
    const creditor = creditors[0]!;
    const debtor = debtors[0]!;
    const amount = Math.min(creditor.balance, debtor.balance);
    transfers.push({ fromId: debtor.companionId, toId: creditor.companionId, amount });
    creditor.balance -= amount;
    debtor.balance -= amount;
    if (creditor.balance === 0) creditors.shift();
    if (debtor.balance === 0) debtors.shift();
  }
  return transfers;
}
