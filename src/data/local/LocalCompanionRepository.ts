import type { TravelGoDB } from '@/data/local/db';
import { toShareRows } from '@/data/local/expenseRecords';
import type { Companion, Expense } from '@/data/models';
import {
  type CompanionRepository,
  type CompanionUsage,
  CompanionInUseError,
  EntityNotFoundError,
  InvalidSplitError,
  ValidationError,
} from '@/data/repositories';
import { cleanCompanionName } from '@/data/rules/companion';
import { participantsFromShares, type SplitParticipant, splitExpense } from '@/data/rules/split';
import { cleanId } from '@/data/rules/validation';
import type { Clock } from '@/lib/dates';
import { newId } from '@/lib/id';

export function createLocalCompanionRepository(db: TravelGoDB, now: Clock): CompanionRepository {
  const ofTrip = (tripId: string) => db.companions.where('tripId').equals(tripId).sortBy('order');

  async function requireCompanion(id: string): Promise<Companion> {
    const companion = await db.companions.get(id);
    if (!companion) throw new EntityNotFoundError('companion', id);
    return companion;
  }

  /** `accountId`'s companions among `companions` stop being theirs. */
  async function letGo(companions: Companion[], accountId: string, timestamp: string) {
    for (const companion of companions) {
      if (companion.accountId === accountId) {
        await db.companions.put({ ...companion, accountId: null, updatedAt: timestamp });
      }
    }
  }

  /** See `CompanionUsage`; also the participants left for each expense to re-split. */
  async function usageOf(companion: Companion) {
    const expenses = await db.expenses.where('tripId').equals(companion.tripId).toArray();
    const shares = await db.expenseShares.where('tripId').equals(companion.tripId).toArray();
    const settlements = await db.settlements.where('tripId').equals(companion.tripId).toArray();

    const usage: CompanionUsage = { blockingExpenseIds: [], settlementIds: [], resplitExpenseIds: [] };
    const resplits: { expense: Expense; participants: SplitParticipant[] }[] = [];
    for (const expense of expenses) {
      const participants = participantsFromShares(
        expense.splitMethod,
        shares.filter((share) => share.expenseId === expense.id),
      );
      const takesPart = participants.some((p) => p.companionId === companion.id);
      const rest = participants.filter((p) => p.companionId !== companion.id);
      if (
        expense.payerId === companion.id ||
        (takesPart && (expense.splitMethod === 'amount' || rest.length === 0))
      ) {
        usage.blockingExpenseIds.push(expense.id);
      } else if (takesPart) {
        usage.resplitExpenseIds.push(expense.id);
        resplits.push({ expense, participants: rest });
      }
    }
    usage.settlementIds = settlements
      .filter((s) => s.fromId === companion.id || s.toId === companion.id)
      .map((s) => s.id);
    return { usage, resplits };
  }

  return {
    listByTrip(tripId) {
      return ofTrip(tripId);
    },

    create(input, options = {}) {
      return db.transaction('rw', db.trips, db.companions, async () => {
        if (!(await db.trips.get(input.tripId))) throw new EntityNotFoundError('trip', input.tripId);
        const others = await ofTrip(input.tripId);
        const timestamp = now();
        const companion: Companion = {
          id: options.id !== undefined ? cleanId(options.id) : newId(),
          tripId: input.tripId,
          name: cleanCompanionName(input.name, others),
          isMe: false,
          accountId: input.accountId ?? null,
          order: Math.max(-1, ...others.map((other) => other.order)) + 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        if (companion.accountId) await letGo(others, companion.accountId, timestamp);
        await db.companions.add(companion);
        return companion;
      });
    },

    rename(id, name) {
      return db.transaction('rw', db.companions, async () => {
        const current = await requireCompanion(id);
        const others = (await ofTrip(current.tripId)).filter((other) => other.id !== id);
        const next = { ...current, name: cleanCompanionName(name, others), updatedAt: now() };
        await db.companions.put(next);
        return next;
      });
    },

    claim(id, accountId) {
      return db.transaction('rw', db.companions, async () => {
        const current = await requireCompanion(id);
        if (current.accountId === accountId) return current;
        if (current.accountId !== null) throw new ValidationError('companion is another account’s');
        const timestamp = now();
        const others = (await ofTrip(current.tripId)).filter((other) => other.id !== id);
        await letGo(others, accountId, timestamp);
        const next = { ...current, accountId, updatedAt: timestamp };
        await db.companions.put(next);
        return next;
      });
    },

    usage(id) {
      const tables = [db.companions, db.expenses, db.expenseShares, db.settlements];
      return db.transaction('r', tables, async () => {
        return (await usageOf(await requireCompanion(id))).usage;
      });
    },

    delete(id) {
      const tables = [db.companions, db.expenses, db.expenseShares, db.settlements];
      return db.transaction('rw', tables, async () => {
        const companion = await db.companions.get(id);
        if (!companion) return;
        if (companion.isMe) throw new ValidationError('"나" cannot be deleted');

        const { usage, resplits } = await usageOf(companion);
        if (usage.blockingExpenseIds.length > 0 || usage.settlementIds.length > 0) {
          throw new CompanionInUseError(usage);
        }

        const timestamp = now();
        for (const { expense, participants } of resplits) {
          const split = splitExpense(expense.amount, expense.payerId, expense.splitMethod, participants);
          if (!split.ok) throw new InvalidSplitError(split.error);
          await db.expenseShares.where('expenseId').equals(expense.id).delete();
          await db.expenseShares.bulkAdd(toShareRows(expense, split.shares, timestamp));
          await db.expenses.put({ ...expense, updatedAt: timestamp });
        }
        await db.companions.delete(id);
      });
    },
  };
}
