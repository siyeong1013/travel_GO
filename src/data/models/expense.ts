import type { CurrencyCode, ID, ISODateTime, LocalDate } from '@/data/models/common';

export type ExpenseCategory =
  | 'food'
  | 'transport'
  | 'flight'
  | 'lodging'
  | 'shopping'
  | 'sightseeing'
  | 'other';
export type PaymentMethod = 'cash' | 'card';
export type SplitMethod = 'equal' | 'amount' | 'ratio';
export type ExchangeRateSource = 'same' | 'api' | 'last' | 'manual';

/** Someone on the trip: a name, and in a trip shared with friends maybe their account. */
export interface Companion {
  id: ID;
  tripId: ID;
  name: string;
  /**
   * "나" of whoever made the trip: one per trip, created with it. Renamable, not deletable. To the
   * friends a trip is shared with, it is the owner (see `myCompanion`).
   */
  isMe: boolean;
  /** The account of the person this is: a friend picks theirs when joining. Null: a name only. */
  accountId: string | null;
  order: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** The rate when the expense was recorded: 1 unit of the expense currency = `rate` × `quote`. */
export interface ExchangeRateSnapshot {
  /** Positive decimal string, e.g. "9.0412". "1" when the expense is in the settlement currency. */
  rate: string;
  /** The trip's settlement currency at the time. */
  quote: CurrencyCode;
  source: ExchangeRateSource;
  /**
   * When the API published the rate; kept when a later expense reuses it (`last`).
   * Null for typed rates.
   */
  fetchedAt: ISODateTime | null;
}

export interface Expense {
  id: ID;
  tripId: ID;
  /** May fall outside the trip's dates (flights or hotels paid in advance). */
  date: LocalDate;
  /** Positive integer in the currency's minor unit (JPY 1,200 → 1200; USD 12.34 → 1234). */
  amount: number;
  currency: CurrencyCode;
  exchangeRate: ExchangeRateSnapshot;
  category: ExpenseCategory;
  paymentMethod: PaymentMethod;
  /**
   * Who paid: one or more, none twice. Several paid it in equal parts (what doesn't divide on
   * `remainderHolder`), as when one paid and another later gave them their half.
   */
  payerIds: ID[];
  splitMethod: SplitMethod;
  /** What it was, its name in the ledger (`타코야키`); '' when none (the category stands in). */
  title: string;
  /** Notes; '' when none. */
  memo: string;
  scheduleItemId: ID | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/**
 * One person's part of an expense; the shares of an expense always add up to its amount.
 * `weight` is 1 for equal splits, the entered weight for ratio splits, null for amount splits,
 * and 0 for a payer who isn't a participant but carries the rounding remainder.
 */
export interface ExpenseShare {
  id: ID;
  tripId: ID;
  expenseId: ID;
  companionId: ID;
  weight: number | null;
  /** In the expense currency's minor unit. */
  amount: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ExpenseWithShares extends Expense {
  shares: ExpenseShare[];
}

/** A transfer marked as done ("송금 완료"). Counts toward balances. */
export interface Settlement {
  id: ID;
  tripId: ID;
  fromId: ID;
  toId: ID;
  /** In `currency` (the trip's settlement currency), minor unit. */
  amount: number;
  currency: CurrencyCode;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
