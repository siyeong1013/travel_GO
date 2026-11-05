import { createDataLayer } from '@/data/dataLayer';
import { createLocalRepositories, createTravelGoDB } from '@/data/local';
import type {
  BackupContents,
  Companion,
  CoverPhoto,
  Expense,
  ExpenseWithShares,
  PlaceSnapshot,
  ScheduleItem,
  Trip,
  TripCity,
} from '@/data/models';
import { makeMeCompanion } from '@/data/rules/companion';
import type { ShareDraft } from '@/data/rules/split';
import type { SharingServer } from '@/data/sharing/sharing';
import type { SyncServer } from '@/data/sync/syncEngine';
import type { Clock } from '@/lib/dates';
import { newId } from '@/lib/id';

export const T0 = '2026-01-01T00:00:00.000Z';

/** Deterministic clock: every call is one second after the previous one. */
export function testClock(start = T0): Clock {
  let ms = Date.parse(start);
  return () => new Date((ms += 1000)).toISOString();
}

/** A place found by search (Google data fetched at T0), unless overridden. */
export function makePlace(name: string, overrides: Partial<PlaceSnapshot> = {}): PlaceSnapshot {
  return {
    placeId: `place-${name}`,
    name,
    address: null,
    location: { lat: 34.6873, lng: 135.5262 },
    fetchedAt: T0,
    ...overrides,
  };
}

/** A place entered by hand. */
export function namedPlace(name: string): PlaceSnapshot {
  return { placeId: null, name, address: null, location: null, fetchedAt: null };
}

/** A city typed by hand (no place). */
export function typedCity(name: string): TripCity {
  return { name, placeId: null, location: null, fetchedAt: null };
}

export function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: newId(),
    title: '오사카 여행',
    city: typedCity('오사카'),
    startDate: '2026-11-10',
    endDate: '2026-11-12',
    settlementCurrency: 'KRW',
    budget: null,
    cover: null,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

/** A cover photo as the app stores it (tiny stand-in JPEGs; `name` tells covers apart). */
export function makeCover(name = 'cover'): CoverPhoto {
  return {
    image: `data:image/jpeg;base64,${btoa(name)}`,
    thumbnail: `data:image/jpeg;base64,${btoa(`${name}-thumbnail`)}`,
  };
}

export function makeItem(
  overrides: Partial<ScheduleItem> & Pick<ScheduleItem, 'tripId'>,
): ScheduleItem {
  return {
    id: newId(),
    date: '2026-11-10',
    order: 0,
    place: makePlace('장소'),
    time: null,
    memo: '',
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function makeCompanion(
  overrides: Partial<Companion> & Pick<Companion, 'tripId' | 'name'>,
): Companion {
  return {
    id: newId(),
    isMe: false,
    accountId: null,
    order: 1,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

/** An expense in KRW (unless overridden) with the given shares. */
export function makeExpense(
  overrides: Partial<Expense> & Pick<Expense, 'tripId' | 'payerId' | 'amount'>,
  shares: ShareDraft[],
): ExpenseWithShares {
  const expense: Expense = {
    id: newId(),
    date: '2026-11-10',
    currency: 'KRW',
    exchangeRate: { rate: '1', quote: 'KRW', source: 'same', fetchedAt: null },
    category: 'food',
    paymentMethod: 'card',
    splitMethod: 'equal',
    memo: '',
    scheduleItemId: null,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
  return {
    ...expense,
    shares: shares.map((share) => ({
      id: newId(),
      tripId: expense.tripId,
      expenseId: expense.id,
      ...share,
      createdAt: T0,
      updatedAt: T0,
    })),
  };
}

export function emptyData(): BackupContents {
  return {
    trips: [],
    scheduleItems: [],
    companions: [],
    expenses: [],
    expenseShares: [],
    settlements: [],
    visitedCountries: [],
  };
}

/** Backup data with the given records; each trip gets its "나" unless companions are given. */
export function backupData(data: Partial<BackupContents>): BackupContents {
  const trips = data.trips ?? [];
  return {
    ...emptyData(),
    companions: trips.map((trip) => makeMeCompanion(trip.id, trip.createdAt)),
    ...data,
  };
}

/**
 * An open.er-api.com response for `base` (published 2026-11-03 00:02:31 UTC, next update the
 * day after), shaped like the real one: floats with up to 6 decimals.
 */
export function latestRatesBody(base: string, rates: Record<string, number>) {
  return {
    result: 'success',
    provider: 'https://www.exchangerate-api.com',
    documentation: 'https://www.exchangerate-api.com/docs/free',
    terms_of_use: 'https://www.exchangerate-api.com/terms',
    time_last_update_unix: 1793664151,
    time_last_update_utc: 'Tue, 03 Nov 2026 00:02:31 +0000',
    time_next_update_unix: 1793751021,
    time_next_update_utc: 'Wed, 04 Nov 2026 00:10:21 +0000',
    time_eol_unix: 0,
    base_code: base,
    rates: { [base]: 1, ...rates },
  };
}

export const RATES_PUBLISHED_AT = '2026-11-03T00:02:31.000Z';

/** Fresh, isolated database. Call `db.delete()` after the test. */
export function createTestRepositories(clock: Clock = testClock()) {
  const db = createTravelGoDB(`test-${newId()}`);
  return { db, repos: createLocalRepositories(db, clock) };
}

/** The server side for a test: the real SQL on PGlite (`createSyncDatabase`). */
export interface TestServer {
  serverFor: (userId: string) => SyncServer;
  sharingFor: (userId: string | null) => SharingServer;
}

const noServer = () => Promise.reject(new Error('this test has no server'));

/**
 * What `@/data` exports, on a fresh database and the test clock: screen tests swap it in with
 * `vi.mock('@/data', async () => (await import('@/test/fixtures')).createTestData())`.
 * `server` answers sync and sharing (none unless given). Nothing comes in realtime.
 */
export function createTestData(server?: TestServer, clock: Clock = testClock()) {
  const db = createTravelGoDB(`test-${newId()}`);
  const connect = server ? async (userId: string) => server.serverFor(userId) : noServer;
  return {
    db,
    ...createDataLayer(db, connect, clock),
    connectSharing: server ? async (userId: string | null) => server.sharingFor(userId) : noServer,
    watchServer: noRealtime,
  };
}

const noRealtime: (onChange: () => void) => Promise<() => void> = async () => () => {};
