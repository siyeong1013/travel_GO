import type { TravelGoDB } from '@/data/local/db';
import type { Companion, Expense, ExpenseShare, ID, ISODateTime } from '@/data/models';
import type { ShareDraft } from '@/data/rules/split';
import { newId } from '@/lib/id';

export function toShareRows(
  expense: Pick<Expense, 'id' | 'tripId'>,
  drafts: ShareDraft[],
  timestamp: ISODateTime,
): ExpenseShare[] {
  return drafts.map((draft) => ({
    id: newId(),
    tripId: expense.tripId,
    expenseId: expense.id,
    companionId: draft.companionId,
    weight: draft.weight,
    amount: draft.amount,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}

/** `shares` in companion order. */
export function sortShares(shares: ExpenseShare[], companions: Companion[]): ExpenseShare[] {
  const order = new Map(companions.map((c) => [c.id, c.order]));
  const position = (share: ExpenseShare) => order.get(share.companionId) ?? Number.MAX_SAFE_INTEGER;
  return [...shares].sort((a, b) => position(a) - position(b));
}

/**
 * Expenses outlive the schedule items they were linked to: only the link goes.
 * Call inside a transaction that includes `expenses`.
 */
export async function unlinkExpenses(db: TravelGoDB, scheduleItemIds: ID[], timestamp: ISODateTime) {
  if (scheduleItemIds.length === 0) return;
  await db.expenses
    .where('scheduleItemId')
    .anyOf(scheduleItemIds)
    .modify({ scheduleItemId: null, updatedAt: timestamp });
}
