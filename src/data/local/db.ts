import Dexie, { type Table } from 'dexie';
import type { ID, ScheduleItem, Trip } from '@/data/models';

export type TravelGoDB = Dexie & {
  trips: Table<Trip, ID>;
  scheduleItems: Table<ScheduleItem, ID>;
};

export const DEFAULT_DB_NAME = 'travel-go';

export function createTravelGoDB(name = DEFAULT_DB_NAME): TravelGoDB {
  const db = new Dexie(name) as TravelGoDB;

  // Schema history. NEVER edit or delete a version once released: add
  // `db.version(n + 1).stores({...}).upgrade(tx => ...)` below instead.
  // `stores` lists indexed fields only. IndexedDB cannot index null, so
  // `scheduleItems.date` (null = inbox) is not indexed; query by tripId and filter.
  db.version(1).stores({
    trips: 'id',
    scheduleItems: 'id, tripId',
  });

  return db;
}
