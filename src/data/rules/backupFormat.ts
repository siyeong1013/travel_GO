import type {
  BackupFile,
  GeoPoint,
  ISODateTime,
  LocalDate,
  LocalTime,
  ScheduleItem,
  Trip,
} from '@/data/models';
import { BackupFormatError } from '@/data/repositories';
import { compareItems } from '@/data/rules/schedule';
import { compareTrips } from '@/data/rules/trip';
import { isGeoPoint } from '@/data/rules/validation';
import { isIsoDateTime, isLocalDate, isLocalTime } from '@/lib/dates';

/**
 * Bump when the shape of `BackupFile` changes, and teach `parseBackupFile` to convert
 * files of every older version (they must stay importable).
 */
export const BACKUP_SCHEMA_VERSION = 1;

export function createBackupFile(
  trips: Trip[],
  scheduleItems: ScheduleItem[],
  exportedAt: ISODateTime,
): BackupFile {
  return {
    app: 'travel-go',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt,
    trips: [...trips].sort(compareTrips),
    scheduleItems: [...scheduleItems].sort(
      (a, b) => (a.tripId < b.tripId ? -1 : a.tripId > b.tripId ? 1 : 0) || compareItems(a, b),
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
const number: Reader<number> = (v, path) =>
  typeof v === 'number' && Number.isFinite(v) ? v : invalid(path, 'number');
const localDate: Reader<LocalDate> = (v, path) => (isLocalDate(v) ? v : invalid(path, 'YYYY-MM-DD'));
const localTime: Reader<LocalTime> = (v, path) => (isLocalTime(v) ? v : invalid(path, 'HH:mm'));
const timestamp: Reader<ISODateTime> = (v, path) =>
  isIsoDateTime(v) ? v : invalid(path, 'ISO 8601 date-time');
const geoPoint: Reader<GeoPoint> = (v, path) =>
  isGeoPoint(v) ? { lat: v.lat, lng: v.lng } : invalid(path, '{ lat, lng }');

function nullable<T>(read: Reader<T>): Reader<T | null> {
  return (v, path) => (v === null ? null : read(v, path));
}

function readTrip(value: unknown, path: string): Trip {
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

function assertUniqueIds(records: { id: string }[], path: string) {
  const seen = new Set<string>();
  records.forEach((record, i) => {
    if (seen.has(record.id)) invalid(`${path}[${i}].id`, 'an id not used earlier in the file');
    seen.add(record.id);
  });
}

/**
 * Validates a JSON-parsed backup and returns a clean copy (unknown fields dropped).
 * Throws `BackupFormatError` with the path of the first problem.
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
  // Convert older versions here, one step at a time, once BACKUP_SCHEMA_VERSION > 1.

  const trips = array(root.trips, '$.trips').map((t, i) => readTrip(t, `$.trips[${i}]`));
  const scheduleItems = array(root.scheduleItems, '$.scheduleItems').map((s, i) =>
    readScheduleItem(s, `$.scheduleItems[${i}]`),
  );
  assertUniqueIds(trips, '$.trips');
  assertUniqueIds(scheduleItems, '$.scheduleItems');

  const tripIds = new Set(trips.map((trip) => trip.id));
  scheduleItems.forEach((item, i) => {
    if (!tripIds.has(item.tripId)) {
      invalid(`$.scheduleItems[${i}].tripId`, 'the id of a trip in this file');
    }
  });

  return {
    app: 'travel-go',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: timestamp(root.exportedAt, '$.exportedAt'),
    trips,
    scheduleItems,
  };
}
