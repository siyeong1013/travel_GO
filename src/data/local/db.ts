import Dexie, { type Table } from 'dexie';
import type {
  Companion,
  Expense,
  ExpenseShare,
  ID,
  ScheduleItem,
  Settlement,
  Trip,
} from '@/data/models';
import { makeMeCompanion } from '@/data/rules/companion';
import { DEFAULT_SETTLEMENT_CURRENCY } from '@/data/rules/money';

export type TravelGoDB = Dexie & {
  trips: Table<Trip, ID>;
  scheduleItems: Table<ScheduleItem, ID>;
  companions: Table<Companion, ID>;
  expenses: Table<Expense, ID>;
  expenseShares: Table<ExpenseShare, ID>;
  settlements: Table<Settlement, ID>;
};

export const DEFAULT_DB_NAME = 'travel-go';

export function createTravelGoDB(name = DEFAULT_DB_NAME): TravelGoDB {
  const db = new Dexie(name) as TravelGoDB;

  // Schema history. NEVER edit or delete a version once released: add
  // `db.version(n + 1).stores({...}).upgrade(tx => ...)` below instead.
  // `stores` lists indexed fields only (and only the tables that change). IndexedDB cannot
  // index null, so `scheduleItems.date` (null = inbox) is not indexed; query by tripId and filter.
  db.version(1).stores({
    trips: 'id',
    scheduleItems: 'id, tripId',
  });

  // v2: expenses and settlement. Existing trips get the defaults and their "나"
  // (keeping updatedAt: this is not an edit, so it must not win backup merges).
  db.version(2)
    .stores({
      companions: 'id, tripId',
      expenses: 'id, tripId, scheduleItemId',
      expenseShares: 'id, tripId, expenseId',
      settlements: 'id, tripId',
    })
    .upgrade(async (tx) => {
      const trips = await tx.table<Trip, ID>('trips').toArray();
      await tx.table<Trip, ID>('trips').bulkPut(
        trips.map((trip) => ({
          ...trip,
          settlementCurrency: trip.settlementCurrency ?? DEFAULT_SETTLEMENT_CURRENCY,
          budget: trip.budget ?? null,
        })),
      );
      await tx
        .table<Companion, ID>('companions')
        .bulkPut(trips.map((trip) => makeMeCompanion(trip.id, trip.createdAt)));
    });

  return db;
}
