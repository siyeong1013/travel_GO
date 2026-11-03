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
import { expireTrip, withCityData } from '@/data/rules/placeData';
import { findOutOfRange, normalizeSchedule } from '@/data/rules/schedule';
import { compareTrips } from '@/data/rules/trip';
import {
  cleanBudget,
  cleanCover,
  cleanPlaceData,
  cleanSettlementCurrency,
  cleanTripFields,
} from '@/data/rules/validation';
import type { Clock } from '@/lib/dates';
import { newId } from '@/lib/id';

export function createLocalTripRepository(db: TravelGoDB, now: Clock): TripRepository {
  /** Removes cities' expired Google data from these stored trips; returns them as they are now. */
  async function expireStored(trips: Trip[]): Promise<Trip[]> {
    const timestamp = now();
    const current = trips.map((trip) => expireTrip(trip, timestamp));
    const expired = current.filter((trip, i) => trip !== trips[i]);
    if (expired.length > 0) await db.trips.bulkPut(expired);
    return current;
  }

  return {
    list() {
      return db.transaction('rw', db.trips, async () => {
        const trips = await expireStored(await db.trips.toArray());
        return trips.sort(compareTrips);
      });
    },

    get(id) {
      return db.transaction('rw', db.trips, async () => {
        const trip = await db.trips.get(id);
        return trip && (await expireStored([trip]))[0];
      });
    },

    create(input) {
      return db.transaction('rw', db.trips, db.companions, async () => {
        const timestamp = now();
        const trip: Trip = {
          id: newId(),
          ...cleanTripFields(input),
          settlementCurrency: DEFAULT_SETTLEMENT_CURRENCY,
          budget: null,
          cover: cleanCover(input.cover ?? null),
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
        const settlementCurrency = cleanSettlementCurrency(
          patch.settlementCurrency ?? current.settlementCurrency,
        );
        const currencyChanged = settlementCurrency !== current.settlementCurrency;
        const next: Trip = expireTrip(
          {
            ...current,
            ...cleanTripFields({
              title: patch.title ?? current.title,
              city: patch.city ?? current.city,
              startDate: patch.startDate ?? current.startDate,
              endDate: patch.endDate ?? current.endDate,
            }),
            settlementCurrency,
            // The budget is in the settlement currency's units: a new currency drops it.
            budget:
              patch.budget !== undefined
                ? cleanBudget(patch.budget)
                : currencyChanged
                  ? null
                  : current.budget,
            cover: patch.cover !== undefined ? cleanCover(patch.cover) : current.cover,
            updatedAt: timestamp,
          },
          timestamp,
        );

        if (currencyChanged) {
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

    refreshCity(id, data) {
      const fresh = cleanPlaceData(data);
      return db.transaction('rw', db.trips, async () => {
        const trip = await db.trips.get(id);
        if (!trip) return undefined;
        const city = withCityData(trip.city, fresh);
        if (city === trip.city) return trip;
        const next = { ...trip, city };
        await db.trips.put(next);
        return next;
      });
    },

    async expirePlaceData() {
      await db.transaction('rw', db.trips, async () => {
        await expireStored(await db.trips.toArray());
      });
    },
  };
}
