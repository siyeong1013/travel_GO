import type {
  CurrencyCode,
  ExchangeRateSnapshot,
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
  payerId: ID;
  splitMethod: SplitMethod;
  /** Who shares it; shares are computed from these (see `splitExpense`). */
  participants: SplitParticipant[];
  memo: string;
  scheduleItemId: ID | null;
}

export interface NewExpense extends ExpenseInput {
  tripId: ID;
}

export interface ExpenseRepository {
  /** Sorted by date, then `createdAt`; shares in companion order. */
  listByTrip(tripId: ID): Promise<ExpenseWithShares[]>;
  /** Throws `InvalidSplitError` when the split doesn't work out (e.g. amounts don't add up). */
  create(input: NewExpense): Promise<ExpenseWithShares>;
  /** Replaces every field and the shares. */
  update(id: ID, input: ExpenseInput): Promise<ExpenseWithShares>;
  /** With its shares. No-op if it doesn't exist. */
  delete(id: ID): Promise<void>;
}
