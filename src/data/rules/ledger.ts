import type {
  Companion,
  CurrencyCode,
  ExpenseCategory,
  ExpenseWithShares,
  ID,
  LocalDate,
  Settlement,
  Trip,
} from '@/data/models';
import { EXPENSE_CATEGORIES } from '@/data/rules/expense';
import { convertAmount } from '@/data/rules/money';
import { remainderHolder } from '@/data/rules/split';

export interface ConvertedExpense {
  /** The expense in the settlement currency. */
  total: number;
  /** What each payer paid of it, in equal parts. Adds up to `total` exactly. */
  paid: Map<ID, number>;
  /** Each person's part in the settlement currency. Adds up to `total` exactly. */
  owed: Map<ID, number>;
}

/**
 * Converts the total once, then divides it equally among the payers (what they paid) and in
 * proportion to the shares (what each owes); what doesn't divide evenly goes to
 * `remainderHolder`, a payer. Null when the stored rate is for another currency.
 */
export function convertExpense(
  expense: ExpenseWithShares,
  settlementCurrency: CurrencyCode,
): ConvertedExpense | null {
  let total = expense.amount;
  if (expense.currency !== settlementCurrency) {
    if (expense.exchangeRate.quote !== settlementCurrency) return null;
    total = convertAmount(
      expense.amount,
      expense.currency,
      settlementCurrency,
      expense.exchangeRate.rate,
    );
  }

  const sharing = expense.shares.filter((s) => s.weight !== 0).map((s) => s.companionId);
  const holder = remainderHolder(expense.payerIds, sharing)!;

  const paid = new Map<ID, number>();
  const each = Number(BigInt(total) / BigInt(expense.payerIds.length));
  for (const payerId of expense.payerIds) paid.set(payerId, each);
  paid.set(holder, (paid.get(holder) ?? 0) + total - each * expense.payerIds.length);

  const owed = new Map<ID, number>();
  let allocated = 0;
  for (const share of expense.shares) {
    const part = Number((BigInt(total) * BigInt(share.amount)) / BigInt(expense.amount));
    owed.set(share.companionId, (owed.get(share.companionId) ?? 0) + part);
    allocated += part;
  }
  owed.set(holder, (owed.get(holder) ?? 0) + total - allocated);
  return { total, paid, owed };
}

export interface CompanionBalance {
  companionId: ID;
  /** Paid for expenses ("낸 돈"). */
  paid: number;
  /** Their part of the expenses ("쓴 돈"). */
  spent: number;
  /** Settlement transfers they sent / received. */
  sent: number;
  received: number;
  /** paid − spent + sent − received. Positive: the others owe them. */
  balance: number;
}

export interface Ledger {
  currency: CurrencyCode;
  /** All expenses, in the settlement currency. */
  total: number;
  budget: number | null;
  /** budget − total; null without a budget. */
  remaining: number | null;
  byCategory: Record<ExpenseCategory, number>;
  /** Dates that have expenses, ascending. */
  byDate: { date: LocalDate; total: number }[];
  /** One per companion, in companion order. Balances add up to 0. */
  balances: CompanionBalance[];
  /** Expenses left out because their rate is for another currency; they need a new rate. */
  unconvertible: ID[];
}

/** Totals and balances of a trip, all in its settlement currency. */
export function buildLedger(
  trip: Pick<Trip, 'settlementCurrency' | 'budget'>,
  companions: Companion[],
  expenses: ExpenseWithShares[],
  settlements: Settlement[],
): Ledger {
  const currency = trip.settlementCurrency;
  const balances = new Map<ID, CompanionBalance>();
  const balanceOf = (companionId: ID) => {
    let entry = balances.get(companionId);
    if (!entry) {
      entry = { companionId, paid: 0, spent: 0, sent: 0, received: 0, balance: 0 };
      balances.set(companionId, entry);
    }
    return entry;
  };
  [...companions].sort((a, b) => a.order - b.order).forEach((c) => balanceOf(c.id));

  const byCategory = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, 0])) as Record<
    ExpenseCategory,
    number
  >;
  const byDate = new Map<LocalDate, number>();
  const unconvertible: ID[] = [];
  let total = 0;

  for (const expense of expenses) {
    const converted = convertExpense(expense, currency);
    if (!converted) {
      unconvertible.push(expense.id);
      continue;
    }
    total += converted.total;
    byCategory[expense.category] += converted.total;
    byDate.set(expense.date, (byDate.get(expense.date) ?? 0) + converted.total);
    for (const [companionId, amount] of converted.paid) balanceOf(companionId).paid += amount;
    for (const [companionId, amount] of converted.owed) balanceOf(companionId).spent += amount;
  }

  for (const settlement of settlements) {
    // Recorded in the settlement currency, which can't change once settlements exist.
    if (settlement.currency !== currency) continue;
    balanceOf(settlement.fromId).sent += settlement.amount;
    balanceOf(settlement.toId).received += settlement.amount;
  }

  for (const entry of balances.values()) {
    entry.balance = entry.paid - entry.spent + entry.sent - entry.received;
  }

  return {
    currency,
    total,
    budget: trip.budget,
    remaining: trip.budget === null ? null : trip.budget - total,
    byCategory,
    byDate: [...byDate]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, dateTotal]) => ({ date, total: dateTotal })),
    balances: [...balances.values()],
    unconvertible,
  };
}
