import type {
  BackupData,
  BackupFile,
  Companion,
  Expense,
  ExpenseShare,
  GeoPoint,
  ID,
  ISODateTime,
  LocalDate,
  LocalTime,
  ScheduleItem,
  Settlement,
  Trip,
} from '@/data/models';
import { BackupFormatError } from '@/data/repositories';
import { makeMeCompanion } from '@/data/rules/companion';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, SPLIT_METHODS } from '@/data/rules/expense';
import { DEFAULT_SETTLEMENT_CURRENCY, isAmount, isCurrency, isRate, MAX_AMOUNT } from '@/data/rules/money';
import { compareItems } from '@/data/rules/schedule';
import { compareTrips } from '@/data/rules/trip';
import { isGeoPoint } from '@/data/rules/validation';
import { isIsoDateTime, isLocalDate, isLocalTime } from '@/lib/dates';

/**
 * Bump when the shape of `BackupFile` changes, and teach `parseBackupFile` to convert
 * files of every older version (they must stay importable).
 * v2: settlement currency and budget on trips; companions, expenses, shares, settlements.
 */
export const BACKUP_SCHEMA_VERSION = 2;

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function createBackupFile(data: BackupData, exportedAt: ISODateTime): BackupFile {
  return {
    app: 'travel-go',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt,
    trips: [...data.trips].sort(compareTrips),
    scheduleItems: [...data.scheduleItems].sort(
      (a, b) => byText(a.tripId, b.tripId) || compareItems(a, b),
    ),
    companions: [...data.companions].sort((a, b) => byText(a.tripId, b.tripId) || a.order - b.order),
    expenses: [...data.expenses].sort(
      (a, b) =>
        byText(a.tripId, b.tripId) ||
        byText(a.date, b.date) ||
        byText(a.createdAt, b.createdAt) ||
        byText(a.id, b.id),
    ),
    expenseShares: [...data.expenseShares].sort(
      (a, b) => byText(a.expenseId, b.expenseId) || byText(a.companionId, b.companionId),
    ),
    settlements: [...data.settlements].sort(
      (a, b) => byText(a.tripId, b.tripId) || byText(a.createdAt, b.createdAt),
    ),
  };
}

// --- parsing untrusted input -------------------------------------------------------------

type Json = Record<string, unknown>;
type Reader<T> = (value: unknown, path: string) => T;

function invalid(path: string, expected: string): never {
  throw new BackupFormatError('backup_invalid', `${path}: expected ${expected}`);
}

const object: Reader<Json> = (v, path) =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : invalid(path, 'object');
const array: Reader<unknown[]> = (v, path) => (Array.isArray(v) ? v : invalid(path, 'array'));
const string: Reader<string> = (v, path) => (typeof v === 'string' ? v : invalid(path, 'string'));
const text: Reader<string> = (v, path) =>
  string(v, path).trim() ? (v as string) : invalid(path, 'non-empty string');
const boolean: Reader<boolean> = (v, path) =>
  typeof v === 'boolean' ? v : invalid(path, 'true or false');
const number: Reader<number> = (v, path) =>
  typeof v === 'number' && Number.isFinite(v) ? v : invalid(path, 'number');
const wholeNumber: Reader<number> = (v, path) =>
  Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= MAX_AMOUNT
    ? (v as number)
    : invalid(path, 'whole number');
const amount: Reader<number> = (v, path) => (isAmount(v) ? v : invalid(path, 'positive whole number'));
const currency: Reader<string> = (v, path) =>
  isCurrency(v) ? v : invalid(path, 'supported currency code');
const rate: Reader<string> = (v, path) => (isRate(v) ? v : invalid(path, 'positive decimal string'));
const localDate: Reader<LocalDate> = (v, path) => (isLocalDate(v) ? v : invalid(path, 'YYYY-MM-DD'));
const localTime: Reader<LocalTime> = (v, path) => (isLocalTime(v) ? v : invalid(path, 'HH:mm'));
const timestamp: Reader<ISODateTime> = (v, path) =>
  isIsoDateTime(v) ? v : invalid(path, 'ISO 8601 date-time');
const geoPoint: Reader<GeoPoint> = (v, path) =>
  isGeoPoint(v) ? { lat: v.lat, lng: v.lng } : invalid(path, '{ lat, lng }');

function nullable<T>(read: Reader<T>): Reader<T | null> {
  return (v, path) => (v === null ? null : read(v, path));
}

function oneOf<T extends string>(values: readonly T[]): Reader<T> {
  return (v, path) => (values.includes(v as T) ? (v as T) : invalid(path, values.join(' | ')));
}

function readTrip(value: unknown, path: string, version: number): Trip {
  const t = object(value, path);
  const city = object(t.city, `${path}.city`);
  const trip: Trip = {
    id: text(t.id, `${path}.id`),
    title: text(t.title, `${path}.title`),
    city: {
      name: text(city.name, `${path}.city.name`),
      placeId: nullable(string)(city.placeId, `${path}.city.placeId`),
      location: nullable(geoPoint)(city.location, `${path}.city.location`),
    },
    startDate: localDate(t.startDate, `${path}.startDate`),
    endDate: localDate(t.endDate, `${path}.endDate`),
    // v1 had no expenses: the defaults of a new trip.
    settlementCurrency:
      version >= 2
        ? currency(t.settlementCurrency, `${path}.settlementCurrency`)
        : DEFAULT_SETTLEMENT_CURRENCY,
    budget: version >= 2 ? nullable(wholeNumber)(t.budget, `${path}.budget`) : null,
    createdAt: timestamp(t.createdAt, `${path}.createdAt`),
    updatedAt: timestamp(t.updatedAt, `${path}.updatedAt`),
  };
  if (trip.endDate < trip.startDate) invalid(`${path}.endDate`, 'a date on or after startDate');
  return trip;
}

function readScheduleItem(value: unknown, path: string): ScheduleItem {
  const s = object(value, path);
  const place = object(s.place, `${path}.place`);
  return {
    id: text(s.id, `${path}.id`),
    tripId: text(s.tripId, `${path}.tripId`),
    date: nullable(localDate)(s.date, `${path}.date`),
    order: number(s.order, `${path}.order`),
    place: {
      placeId: nullable(string)(place.placeId, `${path}.place.placeId`),
      name: text(place.name, `${path}.place.name`),
      address: nullable(string)(place.address, `${path}.place.address`),
      location: nullable(geoPoint)(place.location, `${path}.place.location`),
    },
    time: nullable(localTime)(s.time, `${path}.time`),
    memo: string(s.memo, `${path}.memo`),
    createdAt: timestamp(s.createdAt, `${path}.createdAt`),
    updatedAt: timestamp(s.updatedAt, `${path}.updatedAt`),
  };
}

function readCompanion(value: unknown, path: string): Companion {
  const c = object(value, path);
  return {
    id: text(c.id, `${path}.id`),
    tripId: text(c.tripId, `${path}.tripId`),
    name: text(c.name, `${path}.name`),
    isMe: boolean(c.isMe, `${path}.isMe`),
    order: number(c.order, `${path}.order`),
    createdAt: timestamp(c.createdAt, `${path}.createdAt`),
    updatedAt: timestamp(c.updatedAt, `${path}.updatedAt`),
  };
}

function readExpense(value: unknown, path: string): Expense {
  const e = object(value, path);
  const r = object(e.exchangeRate, `${path}.exchangeRate`);
  return {
    id: text(e.id, `${path}.id`),
    tripId: text(e.tripId, `${path}.tripId`),
    date: localDate(e.date, `${path}.date`),
    amount: amount(e.amount, `${path}.amount`),
    currency: currency(e.currency, `${path}.currency`),
    exchangeRate: {
      rate: rate(r.rate, `${path}.exchangeRate.rate`),
      quote: currency(r.quote, `${path}.exchangeRate.quote`),
      source: oneOf(['same', 'api', 'last', 'manual'] as const)(r.source, `${path}.exchangeRate.source`),
      fetchedAt: nullable(timestamp)(r.fetchedAt, `${path}.exchangeRate.fetchedAt`),
    },
    category: oneOf(EXPENSE_CATEGORIES)(e.category, `${path}.category`),
    paymentMethod: oneOf(PAYMENT_METHODS)(e.paymentMethod, `${path}.paymentMethod`),
    payerId: text(e.payerId, `${path}.payerId`),
    splitMethod: oneOf(SPLIT_METHODS)(e.splitMethod, `${path}.splitMethod`),
    memo: string(e.memo, `${path}.memo`),
    scheduleItemId: nullable(text)(e.scheduleItemId, `${path}.scheduleItemId`),
    createdAt: timestamp(e.createdAt, `${path}.createdAt`),
    updatedAt: timestamp(e.updatedAt, `${path}.updatedAt`),
  };
}

function readShare(value: unknown, path: string): ExpenseShare {
  const s = object(value, path);
  return {
    id: text(s.id, `${path}.id`),
    tripId: text(s.tripId, `${path}.tripId`),
    expenseId: text(s.expenseId, `${path}.expenseId`),
    companionId: text(s.companionId, `${path}.companionId`),
    weight: nullable(wholeNumber)(s.weight, `${path}.weight`),
    amount: wholeNumber(s.amount, `${path}.amount`),
    createdAt: timestamp(s.createdAt, `${path}.createdAt`),
    updatedAt: timestamp(s.updatedAt, `${path}.updatedAt`),
  };
}

function readSettlement(value: unknown, path: string): Settlement {
  const s = object(value, path);
  return {
    id: text(s.id, `${path}.id`),
    tripId: text(s.tripId, `${path}.tripId`),
    fromId: text(s.fromId, `${path}.fromId`),
    toId: text(s.toId, `${path}.toId`),
    amount: amount(s.amount, `${path}.amount`),
    currency: currency(s.currency, `${path}.currency`),
    createdAt: timestamp(s.createdAt, `${path}.createdAt`),
    updatedAt: timestamp(s.updatedAt, `${path}.updatedAt`),
  };
}

function assertUniqueIds(records: { id: string }[], path: string) {
  const seen = new Set<string>();
  records.forEach((record, i) => {
    if (seen.has(record.id)) invalid(`${path}[${i}].id`, 'an id not used earlier in the file');
    seen.add(record.id);
  });
}

/** Every reference points at a record of the same trip, and every expense's shares add up. */
function assertConsistent(data: BackupData) {
  const tripIds = new Set(data.trips.map((trip) => trip.id));
  const tripOf = <T extends { id: ID; tripId: ID }>(records: T[]) =>
    new Map(records.map((record) => [record.id, record.tripId]));
  const itemTrips = tripOf(data.scheduleItems);
  const companionTrips = tripOf(data.companions);
  const expenseTrips = tripOf(data.expenses);

  for (const [path, records] of [
    ['$.scheduleItems', data.scheduleItems],
    ['$.companions', data.companions],
    ['$.expenses', data.expenses],
    ['$.settlements', data.settlements],
  ] as const) {
    records.forEach((record, i) => {
      if (!tripIds.has(record.tripId)) invalid(`${path}[${i}].tripId`, 'the id of a trip in this file');
    });
  }

  for (const trip of data.trips) {
    const me = data.companions.filter((c) => c.tripId === trip.id && c.isMe);
    if (me.length !== 1) invalid(`$.companions`, `exactly one "나" (isMe) for trip ${trip.id}`);
  }

  const sameTrip = (map: Map<ID, ID>, id: ID | null, tripId: ID) => id === null || map.get(id) === tripId;
  data.expenses.forEach((expense, i) => {
    if (!sameTrip(companionTrips, expense.payerId, expense.tripId)) {
      invalid(`$.expenses[${i}].payerId`, 'a companion of the same trip');
    }
    if (!sameTrip(itemTrips, expense.scheduleItemId, expense.tripId)) {
      invalid(`$.expenses[${i}].scheduleItemId`, 'null or a schedule item of the same trip');
    }
  });

  const shareSums = new Map<ID, number>();
  data.expenseShares.forEach((share, i) => {
    if (expenseTrips.get(share.expenseId) !== share.tripId) {
      invalid(`$.expenseShares[${i}].expenseId`, 'an expense of the same trip');
    }
    if (!sameTrip(companionTrips, share.companionId, share.tripId)) {
      invalid(`$.expenseShares[${i}].companionId`, 'a companion of the same trip');
    }
    shareSums.set(share.expenseId, (shareSums.get(share.expenseId) ?? 0) + share.amount);
  });
  data.expenses.forEach((expense, i) => {
    if (shareSums.get(expense.id) !== expense.amount) {
      invalid(`$.expenses[${i}].amount`, 'the sum of its shares');
    }
  });

  data.settlements.forEach((settlement, i) => {
    for (const field of ['fromId', 'toId'] as const) {
      if (!sameTrip(companionTrips, settlement[field], settlement.tripId)) {
        invalid(`$.settlements[${i}].${field}`, 'a companion of the same trip');
      }
    }
    if (settlement.fromId === settlement.toId) invalid(`$.settlements[${i}].toId`, 'someone else');
  });
}

/**
 * Validates a JSON-parsed backup and returns a clean copy (unknown fields dropped), converted
 * to the current schema. Throws `BackupFormatError` with the path of the first problem.
 */
export function parseBackupFile(raw: unknown): BackupFile {
  const root = object(raw, '$');
  if (root.app !== 'travel-go') {
    throw new BackupFormatError('backup_invalid', 'not a travel GO backup file');
  }
  const version = root.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    invalid('$.schemaVersion', 'positive integer');
  }
  if (version > BACKUP_SCHEMA_VERSION) {
    throw new BackupFormatError(
      'backup_unsupported_version',
      `schemaVersion ${version} is newer than this app supports (${BACKUP_SCHEMA_VERSION})`,
    );
  }

  const list = <T>(key: string, read: Reader<T>) =>
    array(root[key], `$.${key}`).map((v, i) => read(v, `$.${key}[${i}]`));

  const trips = list('trips', (v, path) => readTrip(v, path, version));
  const data: BackupData =
    version === 1
      ? {
          trips,
          scheduleItems: list('scheduleItems', readScheduleItem),
          // Same "나" id as the DB migration, so importing a v1 file twice can't duplicate it.
          companions: trips.map((trip) => makeMeCompanion(trip.id, trip.createdAt)),
          expenses: [],
          expenseShares: [],
          settlements: [],
        }
      : {
          trips,
          scheduleItems: list('scheduleItems', readScheduleItem),
          companions: list('companions', readCompanion),
          expenses: list('expenses', readExpense),
          expenseShares: list('expenseShares', readShare),
          settlements: list('settlements', readSettlement),
        };

  for (const key of Object.keys(data) as (keyof BackupData)[]) {
    assertUniqueIds(data[key], `$.${key}`);
  }
  assertConsistent(data);

  return {
    app: 'travel-go',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: timestamp(root.exportedAt, '$.exportedAt'),
    ...data,
  };
}
