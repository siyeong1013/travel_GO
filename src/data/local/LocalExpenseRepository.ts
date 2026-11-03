import type { TravelGoDB } from '@/data/local/db';
import { sortShares, toShareRows } from '@/data/local/expenseRecords';
import type { Expense, ExpenseShare, ExpenseWithShares, ID } from '@/data/models';
import { EntityNotFoundError, type ExpenseRepository, type UsedRate } from '@/data/repositories';
import { cleanExpense } from '@/data/rules/expense';
import type { Clock } from '@/lib/dates';
import { newId } from '@/lib/id';

const compareExpenses = (a: Expense, b: Expense) =>
  a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

export function createLocalExpenseRepository(db: TravelGoDB, now: Clock): ExpenseRepository {
  const writeTables = [db.trips, db.companions, db.scheduleItems, db.expenses, db.expenseShares];

  /** The trip's people and schedule, to check an expense against. */
  async function contextFor(tripId: ID) {
    const trip = await db.trips.get(tripId);
    if (!trip) throw new EntityNotFoundError('trip', tripId);
    const companions = await db.companions.where('tripId').equals(tripId).toArray();
    const items = await db.scheduleItems.where('tripId').equals(tripId).toArray();
    return {
      companions,
      context: {
        settlementCurrency: trip.settlementCurrency,
        companionIds: new Set(companions.map((c) => c.id)),
        scheduleItemIds: new Set(items.map((item) => item.id)),
      },
    };
  }

  return {
    listByTrip(tripId) {
      const tables = [db.companions, db.expenses, db.expenseShares];
      return db.transaction('r', tables, async () => {
        const expenses = await db.expenses.where('tripId').equals(tripId).toArray();
        const shares = await db.expenseShares.where('tripId').equals(tripId).toArray();
        const companions = await db.companions.where('tripId').equals(tripId).toArray();
        const byExpense = new Map<ID, ExpenseShare[]>();
        for (const share of shares) {
          byExpense.set(share.expenseId, [...(byExpense.get(share.expenseId) ?? []), share]);
        }
        return expenses.sort(compareExpenses).map(
          (expense): ExpenseWithShares => ({
            ...expense,
            shares: sortShares(byExpense.get(expense.id) ?? [], companions),
          }),
        );
      });
    },

    async usedRates() {
      // No index fits (currency and quote across trips); a personal ledger is small enough to scan.
      const latest = new Map<string, Expense>();
      await db.expenses.each((expense) => {
        if (expense.currency === expense.exchangeRate.quote) return;
        const key = `${expense.currency}/${expense.exchangeRate.quote}`;
        const kept = latest.get(key);
        const order = kept
          ? expense.createdAt.localeCompare(kept.createdAt) || expense.id.localeCompare(kept.id)
          : 1;
        if (order > 0) latest.set(key, expense);
      });
      return [...latest.values()].map(
        ({ currency, exchangeRate, createdAt }): UsedRate => ({ currency, exchangeRate, createdAt }),
      );
    },

    create(input) {
      return db.transaction('rw', writeTables, async () => {
        const { companions, context } = await contextFor(input.tripId);
        const { fields, shares } = cleanExpense(input, context);
        const timestamp = now();
        const expense: Expense = {
          id: newId(),
          tripId: input.tripId,
          ...fields,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        const rows = toShareRows(expense, shares, timestamp);
        await db.expenses.add(expense);
        await db.expenseShares.bulkAdd(rows);
        return { ...expense, shares: sortShares(rows, companions) };
      });
    },

    update(id, input) {
      return db.transaction('rw', writeTables, async () => {
        const current = await db.expenses.get(id);
        if (!current) throw new EntityNotFoundError('expense', id);
        const { companions, context } = await contextFor(current.tripId);
        const { fields, shares } = cleanExpense(input, context);
        const timestamp = now();
        const expense: Expense = { ...current, ...fields, updatedAt: timestamp };
        const rows = toShareRows(expense, shares, timestamp);
        await db.expenseShares.where('expenseId').equals(id).delete();
        await db.expenseShares.bulkAdd(rows);
        await db.expenses.put(expense);
        return { ...expense, shares: sortShares(rows, companions) };
      });
    },

    delete(id) {
      return db.transaction('rw', db.expenses, db.expenseShares, async () => {
        await db.expenseShares.where('expenseId').equals(id).delete();
        await db.expenses.delete(id);
      });
    },
  };
}
