import type { TravelGoDB } from '@/data/local/db';
import { unlinkExpenses } from '@/data/local/expenseRecords';
import type { Trip } from '@/data/models';
import {
  CurrencyLockedError,
  EntityNotFoundError,
  OutOfRangeItemsError,
  type TripRepository,
} from '@/data/repositories';
import { makeMeCompanion } from '@/data/rules/companion';
import { DEFAULT_SETTLEMENT_CURRENCY } from '@/data/rules/money';
import { findOutOfRange, normalizeSchedule } from '@/data/rules/schedule';
import { compareTrips } from '@/data/rules/trip';
import { cleanBudget, cleanSettlementCurrency, cleanTripFields } from '@/data/rules/validation';
import type { Clock } from '@/lib/dates';
import { newId } from '@/lib/id';

export function createLocalTripRepository(db: TravelGoDB, now: Clock): TripRepository {
  return {
    async list() {
      const trips = await db.trips.toArray();
      return trips.sort(compareTrips);
    },

    get(id) {
      return db.trips.get(id);
    },

    create(input) {
      return db.transaction('rw', db.trips, db.companions, async () => {
        const timestamp = now();
        const trip: Trip = {
          id: newId(),
          ...cleanTripFields(input),
          settlementCurrency: DEFAULT_SETTLEMENT_CURRENCY,
          budget: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        await db.trips.add(trip);
        await db.companions.add(makeMeCompanion(trip.id, timestamp));
        return trip;
      });
    },

    update(id, patch, options = {}) {
      const tables = [db.trips, db.scheduleItems, db.expenses, db.settlements];
      return db.transaction('rw', tables, async () => {
        const current = await db.trips.get(id);
        if (!current) throw new EntityNotFoundError('trip', id);

        const timestamp = now();
        const next: Trip = {
          ...current,
          ...cleanTripFields({
            title: patch.title ?? current.title,
            city: patch.city ?? current.city,
            startDate: patch.startDate ?? current.startDate,
            endDate: patch.endDate ?? current.endDate,
          }),
          settlementCurrency: cleanSettlementCurrency(
            patch.settlementCurrency ?? current.settlementCurrency,
          ),
          budget: patch.budget !== undefined ? cleanBudget(patch.budget) : current.budget,
          updatedAt: timestamp,
        };

        if (next.settlementCurrency !== current.settlementCurrency) {
          const expenses = await db.expenses.where('tripId').equals(id).count();
          const settlements = await db.settlements.where('tripId').equals(id).count();
          if (expenses + settlements > 0) throw new CurrencyLockedError();
        }

        const items = await db.scheduleItems.where('tripId').equals(id).toArray();
        const outside = findOutOfRange(next, items);
        if (outside.length > 0) {
          if (options.outOfRangeItems === 'delete') {
            const ids = outside.map((item) => item.id);
            await db.scheduleItems.bulkDelete(ids);
            await unlinkExpenses(db, ids, timestamp);
          } else if (options.outOfRangeItems === 'moveToInbox') {
            await db.scheduleItems.bulkPut(normalizeSchedule([next], items, timestamp).changed);
          } else {
            const dates = [...new Set(outside.map((item) => item.date!))].sort();
            throw new OutOfRangeItemsError(outside.length, dates);
          }
        }

        await db.trips.put(next);
        return next;
      });
    },

    delete(id) {
      const tables = [
        db.trips,
        db.scheduleItems,
        db.companions,
        db.expenses,
        db.expenseShares,
        db.settlements,
      ];
      return db.transaction('rw', tables, async () => {
        for (const table of tables.slice(1)) await table.where('tripId').equals(id).delete();
        await db.trips.delete(id);
      });
    },
  };
}
