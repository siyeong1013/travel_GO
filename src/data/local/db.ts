import Dexie, { type Table } from 'dexie';
import type {
  Companion,
  Expense,
  ExpenseShare,
  ID,
  ScheduleItem,
  Settlement,
  Trip,
  TripCity,
  VisitedCountry,
} from '@/data/models';
import { makeMeCompanion } from '@/data/rules/companion';
import { DEFAULT_SETTLEMENT_CURRENCY } from '@/data/rules/money';
import type { SyncedRecord, SyncState } from '@/data/sync/records';

export type TravelGoDB = Dexie & {
  trips: Table<Trip, ID>;
  scheduleItems: Table<ScheduleItem, ID>;
  companions: Table<Companion, ID>;
  expenses: Table<Expense, ID>;
  expenseShares: Table<ExpenseShare, ID>;
  settlements: Table<Settlement, ID>;
  syncedRecords: Table<SyncedRecord, ID>;
  syncState: Table<SyncState, 'state'>;
  visitedCountries: Table<VisitedCountry, string>;
};

export const DEFAULT_DB_NAME = 'travel-go';

/** A trip as stored before v8: one city, no countries. (Older upgrades below are typed with it.) */
type TripBeforeV8 = Omit<Trip, 'cities' | 'countries'> & { city: TripCity };

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

  // v3: when Google's place data was fetched (it may be kept for 30 days, data/rules/placeData).
  // Unknown for existing data: the record's creation time stands in (the data can't be older).
  db.version(3)
    .stores({})
    .upgrade(async (tx) => {
      await tx
        .table<ScheduleItem, ID>('scheduleItems')
        .toCollection()
        .modify((item) => {
          const { placeId, address, location } = item.place;
          const fromGoogle = placeId !== null && (address !== null || location !== null);
          item.place.fetchedAt = fromGoogle ? item.createdAt : null;
        });
      await tx
        .table<TripBeforeV8, ID>('trips')
        .toCollection()
        .modify((trip) => {
          const { placeId, location } = trip.city;
          trip.city.fetchedAt = placeId !== null && location !== null ? trip.createdAt : null;
        });
    });

  // v4: a cover photo the user picks for the trip. Existing trips have none (the city's gradient).
  db.version(4)
    .stores({})
    .upgrade(async (tx) => {
      await tx
        .table<Trip, ID>('trips')
        .toCollection()
        .modify((trip) => {
          trip.cover = null;
        });
    });

  // v5: syncing with the account's copy on the server (data/sync). What the server has of each
  // record, and whose trips these are. Empty until the first sync.
  db.version(5).stores({
    syncedRecords: 'id, tripId',
    syncState: 'id',
  });

  // v6: a companion can be someone's account, in a trip shared with friends. None is yet
  // (`updatedAt` stays: not an edit, which would win merges and syncs).
  db.version(6)
    .stores({})
    .upgrade(async (tx) => {
      await tx
        .table<Companion, ID>('companions')
        .toCollection()
        .modify((companion) => {
          companion.accountId = null;
        });
    });

  // v7: the countries the person has been to ("다녀온 나라"), by ISO code.
  db.version(7).stores({
    visitedCountries: 'id',
  });

  // v8: a trip goes to countries, and maybe to several cities (`city` became `cities`). Existing
  // trips keep their city and have no countries yet (`updatedAt` stays: not an edit).
  db.version(8)
    .stores({})
    .upgrade(async (tx) => {
      await tx
        .table<
          Omit<Trip, 'cities' | 'countries'> & {
            city?: TripCity;
            cities?: TripCity[];
            countries?: string[];
          },
          ID
        >('trips')
        .toCollection()
        .modify((trip) => {
          if (trip.city) trip.cities = [trip.city];
          trip.countries = [];
          delete trip.city;
        });
    });

  // v9: an expense can have several payers, who paid it in equal parts (`payerId` became
  // `payerIds`). `updatedAt` stays: not an edit.
  db.version(9)
    .stores({})
    .upgrade(async (tx) => {
      await tx
        .table<Omit<Expense, 'payerIds'> & { payerId?: ID; payerIds?: ID[] }, ID>('expenses')
        .toCollection()
        .modify((expense) => {
          if (expense.payerId !== undefined) expense.payerIds = [expense.payerId];
          delete expense.payerId;
        });
    });

  // v10: a schedule item can hold the flight it is (`flight`); none has one yet. `updatedAt`
  // stays: not an edit.
  db.version(10)
    .stores({})
    .upgrade(async (tx) => {
      await tx
        .table<Omit<ScheduleItem, 'flight'> & { flight?: ScheduleItem['flight'] }, ID>(
          'scheduleItems',
        )
        .toCollection()
        .modify((item) => {
          if (item.flight === undefined) item.flight = null;
        });
    });

  return db;
}
