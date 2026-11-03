import type { CurrencyCode } from '@/data/models';
import { parseAmount, toDecimalString } from '@/data/rules/money';
import { amountError } from '@/features/expenses/expenseForm';

/** The budget as typed, in minor units of `currency`. Empty means no budget. */
export function readBudget(
  text: string,
  currency: CurrencyCode,
): { budget: number | null } | { error: string } {
  if (!text.trim()) return { budget: null };
  const error = amountError(text, currency);
  return error ? { error } : { budget: parseAmount(text, currency)! };
}

/** What the budget field starts with. */
export function budgetText(budget: number | null, currency: CurrencyCode): string {
  return budget === null ? '' : toDecimalString(budget, currency);
}
