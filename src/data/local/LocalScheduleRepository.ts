import type { TravelGoDB } from '@/data/local/db';
import type { ID, LocalDate, ScheduleItem, Trip } from '@/data/models';
import { EntityNotFoundError, type ScheduleRepository, ValidationError } from '@/data/repositories';
import { compareItems, planAppend, planMove, planRemove } from '@/data/rules/schedule';
import { cleanPlace, cleanTime } from '@/data/rules/validation';
import { type Clock, isDateInRange, isLocalDate } from '@/lib/dates';
import { newId } from '@/lib/id';

export function createLocalScheduleRepository(db: TravelGoDB, now: Clock): ScheduleRepository {
  const itemsOfTrip = (tripId: ID) => db.scheduleItems.where('tripId').equals(tripId).toArray();

  async function requireTrip(id: ID): Promise<Trip> {
    const trip = await db.trips.get(id);
    if (!trip) throw new EntityNotFoundError('trip', id);
    return trip;
  }

  function assertDateInTrip(trip: Trip, date: LocalDate | null) {
    if (date === null) return;
    if (!isLocalDate(date) || !isDateInRange(date, trip.startDate, trip.endDate)) {
      throw new ValidationError(
        `date ${date} is outside the trip (${trip.startDate}..${trip.endDate})`,
      );
    }
  }

  return {
    async listByTrip(tripId) {
      const items = await itemsOfTrip(tripId);
      return items.sort(compareItems);
    },

    create(input) {
      return db.transaction('rw', db.trips, db.scheduleItems, async () => {
        const trip = await requireTrip(input.tripId);
        assertDateInTrip(trip, input.date);

        const timestamp = now();
        const item: ScheduleItem = {
          id: newId(),
          tripId: trip.id,
          date: input.date,
          order: 0,
          place: cleanPlace(input.place),
          time: cleanTime(input.time),
          memo: input.memo ?? '',
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        const changed = planAppend(await itemsOfTrip(trip.id), item, timestamp);
        await db.scheduleItems.bulkPut(changed);
        return changed.find((i) => i.id === item.id)!;
      });
    },

    update(id, patch) {
      return db.transaction('rw', db.scheduleItems, async () => {
        const current = await db.scheduleItems.get(id);
        if (!current) throw new EntityNotFoundError('scheduleItem', id);

        const next: ScheduleItem = {
          ...current,
          place: patch.place ? cleanPlace(patch.place) : current.place,
          time: patch.time !== undefined ? cleanTime(patch.time) : current.time,
          memo: patch.memo ?? current.memo,
          updatedAt: now(),
        };
        await db.scheduleItems.put(next);
        return next;
      });
    },

    delete(id) {
      return db.transaction('rw', db.scheduleItems, async () => {
        const item = await db.scheduleItems.get(id);
        if (!item) return;
        const changed = planRemove(await itemsOfTrip(item.tripId), id, now());
        await db.scheduleItems.delete(id);
        await db.scheduleItems.bulkPut(changed);
      });
    },

    move(id, to) {
      return db.transaction('rw', db.trips, db.scheduleItems, async () => {
        const item = await db.scheduleItems.get(id);
        if (!item) throw new EntityNotFoundError('scheduleItem', id);
        if (!Number.isInteger(to.index) || to.index < 0) {
          throw new ValidationError(`invalid index ${to.index}`);
        }
        assertDateInTrip(await requireTrip(item.tripId), to.date);

        await db.scheduleItems.bulkPut(planMove(await itemsOfTrip(item.tripId), id, to, now()));
      });
    },
  };
}
