import type {
  BackupData,
  ISODateTime,
  PlaceData,
  PlaceSnapshot,
  ScheduleItem,
  Trip,
  TripCity,
} from '@/data/models';

// Google's place data kept on the device: a place's address and coordinates, a city's coordinates.
// The Places API terms allow caching coordinates for up to 30 days (place IDs indefinitely); the
// address is treated the same. Names stay: they are the items' and trips' own titles.

/** Google's data older than this is removed. */
export const PLACE_DATA_MAX_DAYS = 30;
/** Data this old is fetched again when online, so a trip stays usable offline for weeks. */
export const PLACE_DATA_REFRESH_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

function olderThan(fetchedAt: ISODateTime, now: ISODateTime, days: number): boolean {
  return Date.parse(now) - Date.parse(fetchedAt) >= days * DAY_MS;
}

/** The place without Google's address and location once they are 30 days old (else the same object). */
export function expirePlace(place: PlaceSnapshot, now: ISODateTime): PlaceSnapshot {
  if (place.fetchedAt === null || !olderThan(place.fetchedAt, now, PLACE_DATA_MAX_DAYS)) return place;
  return { ...place, address: null, location: null, fetchedAt: null };
}

/** The city without Google's coordinates once they are 30 days old (else the same object). */
export function expireCity(city: TripCity, now: ISODateTime): TripCity {
  if (city.fetchedAt === null || !olderThan(city.fetchedAt, now, PLACE_DATA_MAX_DAYS)) return city;
  return { ...city, location: null, fetchedAt: null };
}

/** Same object when nothing expired. */
export function expireItem(item: ScheduleItem, now: ISODateTime): ScheduleItem {
  const place = expirePlace(item.place, now);
  return place === item.place ? item : { ...item, place };
}

/** Same object when nothing expired. */
export function expireTrip(trip: Trip, now: ISODateTime): Trip {
  const city = expireCity(trip.city, now);
  return city === trip.city ? trip : { ...trip, city };
}

/** What may leave the app or come into it (backups): without expired Google data. */
export function expireBackupData<T extends BackupData>(data: T, now: ISODateTime): T {
  return {
    ...data,
    trips: data.trips.map((trip) => expireTrip(trip, now)),
    scheduleItems: data.scheduleItems.map((item) => expireItem(item, now)),
  };
}

/** Whether a Google place's data should be fetched again: a week old, or already removed. */
export function needsRefresh(
  placeId: string | null,
  fetchedAt: ISODateTime | null,
  now: ISODateTime,
): boolean {
  return placeId !== null && (fetchedAt === null || olderThan(fetchedAt, now, PLACE_DATA_REFRESH_DAYS));
}

/** The place with freshly fetched data (unchanged if it is no longer that place). */
export function withPlaceData(place: PlaceSnapshot, data: PlaceData): PlaceSnapshot {
  if (place.placeId !== data.placeId) return place;
  return { ...place, address: data.address, location: data.location, fetchedAt: data.fetchedAt };
}

/** The city with freshly fetched coordinates (unchanged if it is no longer that place). */
export function withCityData(city: TripCity, data: PlaceData): TripCity {
  if (city.placeId !== data.placeId) return city;
  return { ...city, location: data.location, fetchedAt: data.fetchedAt };
}
