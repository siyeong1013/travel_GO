import { createLocalRepositories, createTravelGoDB } from '@/data/local';
import type { PlaceSnapshot, ScheduleItem, Trip } from '@/data/models';
import type { Clock } from '@/lib/dates';
import { newId } from '@/lib/id';

export const T0 = '2026-01-01T00:00:00.000Z';

/** Deterministic clock: every call is one second after the previous one. */
export function testClock(start = T0): Clock {
  let ms = Date.parse(start);
  return () => new Date((ms += 1000)).toISOString();
}

export function makePlace(name: string, overrides: Partial<PlaceSnapshot> = {}): PlaceSnapshot {
  return {
    placeId: `place-${name}`,
    name,
    address: null,
    location: { lat: 34.6873, lng: 135.5262 },
    ...overrides,
  };
}

export function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: newId(),
    title: '오사카 여행',
    city: { name: '오사카', placeId: null, location: null },
    startDate: '2026-11-10',
    endDate: '2026-11-12',
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
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

/** Fresh, isolated database. Call `db.delete()` after the test. */
export function createTestRepositories() {
  const db = createTravelGoDB(`test-${newId()}`);
  return { db, repos: createLocalRepositories(db, testClock()) };
}
