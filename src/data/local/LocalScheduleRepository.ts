import type { TravelGoDB } from '@/data/local/db';
import { unlinkExpenses } from '@/data/local/expenseRecords';
import type { ID, LocalDate, ScheduleItem, Trip } from '@/data/models';
import { EntityNotFoundError, type ScheduleRepository, ValidationError } from '@/data/repositories';
import { expireItem, expirePlace, withPlaceData } from '@/data/rules/placeData';
import { compareItems, planAppend, planMove, planRemove } from '@/data/rules/schedule';
import { cleanPlace, cleanPlaceData, cleanTime } from '@/data/rules/validation';
import { type Clock, isDateInRange, isLocalDate } from '@/lib/dates';
import { newId } from '@/lib/id';

export function createLocalScheduleRepository(db: TravelGoDB, now: Clock): ScheduleRepository {
  const itemsOfTrip = (tripId: ID) => db.scheduleItems.where('tripId').equals(tripId).toArray();

  async function requireTrip(id: ID): Promise<Trip> {
    const trip = await db.trips.get(id);
    if (!trip) throw new EntityNotFoundError('trip', id);
    return trip;
  }

  /** Removes Google's data that has expired from these stored items; returns them as they are now. */
  async function expireStored(items: ScheduleItem[]): Promise<ScheduleItem[]> {
    const timestamp = now();
    const current = items.map((item) => expireItem(item, timestamp));
    const expired = current.filter((item, i) => item !== items[i]);
    if (expired.length > 0) await db.scheduleItems.bulkPut(expired);
    return current;
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
    listByTrip(tripId) {
      return db.transaction('rw', db.scheduleItems, async () => {
        const items = await expireStored(await itemsOfTrip(tripId));
        return items.sort(compareItems);
      });
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
          place: expirePlace(cleanPlace(input.place), timestamp),
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

        const timestamp = now();
        const next: ScheduleItem = {
          ...current,
          place: expirePlace(patch.place ? cleanPlace(patch.place) : current.place, timestamp),
          time: patch.time !== undefined ? cleanTime(patch.time) : current.time,
          memo: patch.memo ?? current.memo,
          updatedAt: timestamp,
        };
        await db.scheduleItems.put(next);
        return next;
      });
    },

    delete(id) {
      return db.transaction('rw', db.scheduleItems, db.expenses, async () => {
        const item = await db.scheduleItems.get(id);
        if (!item) return;
        const timestamp = now();
        const changed = planRemove(await itemsOfTrip(item.tripId), id, timestamp);
        await db.scheduleItems.delete(id);
        await db.scheduleItems.bulkPut(changed);
        await unlinkExpenses(db, [id], timestamp);
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

    refreshPlaces(tripId, places) {
      const byPlace = new Map(places.map((data) => [data.placeId, cleanPlaceData(data)]));
      return db.transaction('rw', db.scheduleItems, async () => {
        const changed: ScheduleItem[] = [];
        for (const item of await itemsOfTrip(tripId)) {
          const data = item.place.placeId === null ? undefined : byPlace.get(item.place.placeId);
          if (data) changed.push({ ...item, place: withPlaceData(item.place, data) });
        }
        await db.scheduleItems.bulkPut(changed);
      });
    },

    async expirePlaceData() {
      await db.transaction('rw', db.scheduleItems, async () => {
        await expireStored(await db.scheduleItems.toArray());
      });
    },
  };
}
