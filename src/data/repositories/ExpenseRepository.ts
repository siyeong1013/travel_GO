import type {
  CurrencyCode,
  ExchangeRateSnapshot,
  Expense,
  ExpenseCategory,
  ExpenseWithShares,
  ID,
  LocalDate,
  PaymentMethod,
  SplitMethod,
} from '@/data/models';
import type { SplitParticipant } from '@/data/rules/split';

export interface ExpenseInput {
  date: LocalDate;
  /** Minor units of `currency`. */
  amount: number;
  currency: CurrencyCode;
  /**
   * Ignored when `currency` is the trip's settlement currency (stored as rate "1").
   * `quote` is always the trip's settlement currency.
   */
  exchangeRate: Pick<ExchangeRateSnapshot, 'rate' | 'source' | 'fetchedAt'>;
  category: ExpenseCategory;
  paymentMethod: PaymentMethod;
  /** One or more, none twice: several paid it in equal parts. */
  payerIds: ID[];
  splitMethod: SplitMethod;
  /** Who shares it; shares are computed from these (see `splitExpense`). */
  participants: SplitParticipant[];
  title: string;
  memo: string;
  scheduleItemId: ID | null;
}

export interface NewExpense extends ExpenseInput {
  tripId: ID;
}

/** The rate an expense was recorded with (`createdAt`: when it was recorded). */
export type UsedRate = Pick<Expense, 'currency' | 'exchangeRate' | 'createdAt'>;

export interface ExpenseRepository {
  /** Sorted by date, then `createdAt`; shares in companion order. */
  listByTrip(tripId: ID): Promise<ExpenseWithShares[]>;
  /**
   * For each currency and quote, the rate of the latest expense (by `createdAt`) in any trip.
   * Expenses in their settlement currency are left out. Prefills new expenses.
   */
  usedRates(): Promise<UsedRate[]>;
  /** Throws `InvalidSplitError` when the split doesn't work out (e.g. amounts don't add up). */
  create(input: NewExpense): Promise<ExpenseWithShares>;
  /** Replaces every field and the shares. */
  update(id: ID, input: ExpenseInput): Promise<ExpenseWithShares>;
  /** With its shares. No-op if it doesn't exist. */
  delete(id: ID): Promise<void>;
}
