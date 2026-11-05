import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocalRepositories, createTravelGoDB, type TravelGoDB } from '@/data/local';
import { meCompanionId } from '@/data/rules/companion';
import { newId } from '@/lib/id';
import { makeItem, makePlace, makeTrip, namedPlace, testClock } from '@/test/fixtures';

let db: TravelGoDB | undefined;

afterEach(async () => {
  await db?.delete();
});

describe('schema migrations', () => {
  it('v1 → v2: existing trips get the defaults and their "나", data untouched', async () => {
    const name = `test-${newId()}`;
    const { settlementCurrency, budget, ...v1Trip } = makeTrip();
    const item = makeItem({ tripId: v1Trip.id });

    // A database as version 1 of the app left it.
    const v1 = new Dexie(name);
    v1.version(1).stores({ trips: 'id', scheduleItems: 'id, tripId' });
    await v1.table('trips').add(v1Trip);
    await v1.table('scheduleItems').add(item);
    v1.close();

    db = createTravelGoDB(name);
    const repos = createLocalRepositories(db, testClock());

    expect(await repos.trips.get(v1Trip.id)).toEqual({
      ...v1Trip,
      settlementCurrency: 'KRW',
      budget: null,
    });
    expect(await repos.companions.listByTrip(v1Trip.id)).toEqual([
      {
        id: meCompanionId(v1Trip.id),
        tripId: v1Trip.id,
        name: '나',
        isMe: true,
        order: 0,
        createdAt: v1Trip.createdAt,
        updatedAt: v1Trip.createdAt,
      },
    ]);
    expect(await repos.schedule.listByTrip(v1Trip.id)).toEqual([item]);
  });

  it("v2 → v3: Google data counts as fetched when its record was created", async () => {
    const name = `test-${newId()}`;
    const withoutFetchedAt = <T extends { fetchedAt: unknown }>({ fetchedAt, ...rest }: T) => rest;
    const trip = makeTrip({
      city: { name: '오사카', placeId: 'osaka', location: { lat: 34.69, lng: 135.5 }, fetchedAt: null },
      createdAt: '2025-12-20T00:00:00.000Z',
      updatedAt: '2025-12-21T00:00:00.000Z',
    });
    const google = makeItem({
      tripId: trip.id,
      place: makePlace('오사카성', { address: '주소' }),
      createdAt: '2025-12-25T00:00:00.000Z',
      updatedAt: '2025-12-26T00:00:00.000Z',
    });
    const typed = makeItem({ tripId: trip.id, order: 1, place: namedPlace('호텔 체크인') });

    // A database as version 2 of the app left it.
    const v2 = new Dexie(name);
    v2.version(1).stores({ trips: 'id', scheduleItems: 'id, tripId' });
    v2.version(2).stores({
      companions: 'id, tripId',
      expenses: 'id, tripId, scheduleItemId',
      expenseShares: 'id, tripId, expenseId',
      settlements: 'id, tripId',
    });
    await v2.table('trips').add({ ...trip, city: withoutFetchedAt(trip.city) });
    await v2.table('scheduleItems').bulkAdd(
      [google, typed].map((item) => ({ ...item, place: withoutFetchedAt(item.place) })),
    );
    v2.close();

    db = createTravelGoDB(name);
    const repos = createLocalRepositories(db, testClock());

    expect(await repos.trips.get(trip.id)).toEqual({
      ...trip,
      city: { ...trip.city, fetchedAt: trip.createdAt },
    });
    expect(await repos.schedule.listByTrip(trip.id)).toEqual([
      { ...google, place: { ...google.place, fetchedAt: google.createdAt } },
      typed,
    ]);
  });

  it('v3 → v4: existing trips have no cover photo, updatedAt untouched', async () => {
    const name = `test-${newId()}`;
    const { cover, ...v3Trip } = makeTrip({ updatedAt: '2025-12-21T00:00:00.000Z' });

    // A database as version 3 of the app left it.
    const v3 = new Dexie(name);
    v3.version(1).stores({ trips: 'id', scheduleItems: 'id, tripId' });
    v3.version(2).stores({
      companions: 'id, tripId',
      expenses: 'id, tripId, scheduleItemId',
      expenseShares: 'id, tripId, expenseId',
      settlements: 'id, tripId',
    });
    v3.version(3).stores({});
    await v3.table('trips').add(v3Trip);
    v3.close();

    db = createTravelGoDB(name);
    const repos = createLocalRepositories(db, testClock());

    expect(await repos.trips.get(v3Trip.id)).toEqual({ ...v3Trip, cover: null });
  });

  it('v4 → v5: the trips stay, with nothing synced yet', async () => {
    const name = `test-${newId()}`;
    const trip = makeTrip();

    // A database as version 4 of the app left it.
    const v4 = new Dexie(name);
    v4.version(1).stores({ trips: 'id', scheduleItems: 'id, tripId' });
    v4.version(2).stores({
      companions: 'id, tripId',
      expenses: 'id, tripId, scheduleItemId',
      expenseShares: 'id, tripId, expenseId',
      settlements: 'id, tripId',
    });
    v4.version(3).stores({});
    v4.version(4).stores({});
    await v4.table('trips').add(trip);
    v4.close();

    db = createTravelGoDB(name);
    expect(await db.trips.toArray()).toEqual([trip]);
    expect(await db.syncedRecords.count()).toBe(0);
    expect(await db.syncState.get('state')).toBeUndefined();
  });
});
