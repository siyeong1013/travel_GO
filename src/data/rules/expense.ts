import type {
  CurrencyCode,
  ExchangeRateSnapshot,
  Expense,
  ExpenseCategory,
  ID,
  PaymentMethod,
  SplitMethod,
} from '@/data/models';
import { type ExpenseInput, InvalidSplitError, ValidationError } from '@/data/repositories';
import { isAmount, isCurrency, isRate } from '@/data/rules/money';
import { type ShareDraft, splitExpense } from '@/data/rules/split';
import { isIsoDateTime, isLocalDate } from '@/lib/dates';

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'food',
  'transport',
  'flight',
  'lodging',
  'shopping',
  'sightseeing',
  'other',
];
export const PAYMENT_METHODS: readonly PaymentMethod[] = ['cash', 'card'];
export const SPLIT_METHODS: readonly SplitMethod[] = ['equal', 'amount', 'ratio'];

/** What an expense is checked against: its trip's currency, people and schedule. */
export interface ExpenseContext {
  settlementCurrency: CurrencyCode;
  companionIds: ReadonlySet<ID>;
  scheduleItemIds: ReadonlySet<ID>;
}

export type ExpenseFields = Omit<Expense, 'id' | 'tripId' | 'createdAt' | 'updatedAt'>;

function cleanRate(input: ExpenseInput, quote: CurrencyCode): ExchangeRateSnapshot {
  if (input.currency === quote) return { rate: '1', quote, source: 'same', fetchedAt: null };
  const { rate, source, fetchedAt } = input.exchangeRate;
  if (!isRate(rate)) throw new ValidationError('exchange rate must be a positive decimal');
  if (source !== 'api' && source !== 'last' && source !== 'manual') {
    throw new ValidationError(`invalid exchange rate source: ${source}`);
  }
  if (fetchedAt !== null && !isIsoDateTime(fetchedAt)) {
    throw new ValidationError('fetchedAt must be an ISO date-time');
  }
  return { rate, quote, source, fetchedAt };
}

/**
 * Checks an expense input against its trip and computes the shares.
 * Throws `ValidationError`, or `InvalidSplitError` when the split doesn't work out.
 */
export function cleanExpense(
  input: ExpenseInput,
  context: ExpenseContext,
): { fields: ExpenseFields; shares: ShareDraft[] } {
  if (!isLocalDate(input.date)) throw new ValidationError('date must be YYYY-MM-DD');
  if (!isCurrency(input.currency)) throw new ValidationError(`unsupported currency: ${input.currency}`);
  if (!isAmount(input.amount)) throw new ValidationError('amount must be a positive whole number');
  if (!EXPENSE_CATEGORIES.includes(input.category)) throw new ValidationError('invalid category');
  if (!PAYMENT_METHODS.includes(input.paymentMethod)) {
    throw new ValidationError('invalid payment method');
  }
  if (!SPLIT_METHODS.includes(input.splitMethod)) throw new ValidationError('invalid split method');
  if (input.payerIds.length === 0) throw new ValidationError('someone has to have paid');
  if (new Set(input.payerIds).size !== input.payerIds.length) {
    throw new ValidationError('a payer is listed twice');
  }
  if (!input.payerIds.every((id) => context.companionIds.has(id))) {
    throw new ValidationError('payer is not on this trip');
  }
  for (const { companionId } of input.participants) {
    if (!context.companionIds.has(companionId)) {
      throw new ValidationError('participant is not on this trip');
    }
  }
  if (input.scheduleItemId !== null && !context.scheduleItemIds.has(input.scheduleItemId)) {
    throw new ValidationError('linked schedule item is not in this trip');
  }

  const split = splitExpense(input.amount, input.payerIds, input.splitMethod, input.participants);
  if (!split.ok) throw new InvalidSplitError(split.error);

  return {
    fields: {
      date: input.date,
      amount: input.amount,
      currency: input.currency,
      exchangeRate: cleanRate(input, context.settlementCurrency),
      category: input.category,
      paymentMethod: input.paymentMethod,
      payerIds: [...input.payerIds],
      splitMethod: input.splitMethod,
      title: input.title,
      memo: input.memo,
      scheduleItemId: input.scheduleItemId,
    },
    shares: split.shares,
  };
}
