import type { TravelGoDB } from '@/data/local/db';
import type { Trip } from '@/data/models';
import { EntityNotFoundError, OutOfRangeItemsError, type TripRepository } from '@/data/repositories';
import { findOutOfRange, normalizeSchedule } from '@/data/rules/schedule';
import { compareTrips } from '@/data/rules/trip';
import { cleanTripFields } from '@/data/rules/validation';
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

    async create(input) {
      const timestamp = now();
      const trip: Trip = {
        id: newId(),
        ...cleanTripFields(input),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await db.trips.add(trip);
      return trip;
    },

    update(id, patch, options = {}) {
      return db.transaction('rw', db.trips, db.scheduleItems, async () => {
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
          updatedAt: timestamp,
        };

        const items = await db.scheduleItems.where('tripId').equals(id).toArray();
        const outside = findOutOfRange(next, items);
        if (outside.length > 0) {
          if (options.outOfRangeItems === 'delete') {
            await db.scheduleItems.bulkDelete(outside.map((item) => item.id));
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
      return db.transaction('rw', db.trips, db.scheduleItems, async () => {
        await db.scheduleItems.where('tripId').equals(id).delete();
        await db.trips.delete(id);
      });
    },
  };
}
