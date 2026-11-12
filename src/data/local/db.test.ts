import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocalRepositories, createTravelGoDB, type TravelGoDB } from '@/data/local';
import type { Trip } from '@/data/models';
import { makeMeCompanion, meCompanionId } from '@/data/rules/companion';
import { newId } from '@/lib/id';
import { makeExpense, makeItem, makePlace, makeTrip, namedPlace, testClock } from '@/test/fixtures';

let db: TravelGoDB | undefined;

/** A trip as the app stored it before v8: one city, no countries. */
function beforeV8({ cities, countries, ...trip }: Trip) {
  return { ...trip, city: cities[0]! };
}

afterEach(async () => {
  await db?.delete();
});

describe('schema migrations', () => {
  it('v1 → v2: existing trips get the defaults and their "나", data untouched', async () => {
    const name = `test-${newId()}`;
    const trip = makeTrip();
    const { settlementCurrency, budget, ...v1Trip } = beforeV8(trip);
    const item = makeItem({ tripId: v1Trip.id });

    // A database as version 1 of the app left it.
    const v1 = new Dexie(name);
    v1.version(1).stores({ trips: 'id', scheduleItems: 'id, tripId' });
    await v1.table('trips').add(v1Trip);
    await v1.table('scheduleItems').add(item);
    v1.close();

    db = createTravelGoDB(name);
    const repos = createLocalRepositories(db, testClock());

    expect(await repos.trips.get(v1Trip.id)).toEqual({ ...trip, settlementCurrency: 'KRW', budget: null });
    expect(await repos.companions.listByTrip(v1Trip.id)).toEqual([
      {
        id: meCompanionId(v1Trip.id),
        tripId: v1Trip.id,
        name: '나',
        isMe: true,
        accountId: null,
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
      cities: [{ name: '오사카', placeId: 'osaka', location: { lat: 34.69, lng: 135.5 }, fetchedAt: null }],
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
    await v2.table('trips').add({ ...beforeV8(trip), city: withoutFetchedAt(trip.cities[0]!) });
    await v2.table('scheduleItems').bulkAdd(
      [google, typed].map((item) => ({ ...item, place: withoutFetchedAt(item.place) })),
    );
    v2.close();

    db = createTravelGoDB(name);
    const repos = createLocalRepositories(db, testClock());

    expect(await repos.trips.get(trip.id)).toEqual({
      ...trip,
      cities: [{ ...trip.cities[0]!, fetchedAt: trip.createdAt }],
    });
    expect(await repos.schedule.listByTrip(trip.id)).toEqual([
      { ...google, place: { ...google.place, fetchedAt: google.createdAt } },
      typed,
    ]);
  });

  it('v3 → v4: existing trips have no cover photo, updatedAt untouched', async () => {
    const name = `test-${newId()}`;
    const trip = makeTrip({ updatedAt: '2025-12-21T00:00:00.000Z' });
    const { cover, ...v3Trip } = beforeV8(trip);

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

    expect(await repos.trips.get(v3Trip.id)).toEqual({ ...trip, cover: null });
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
    await v4.table('trips').add(beforeV8(trip));
    v4.close();

    db = createTravelGoDB(name);
    expect(await db.trips.toArray()).toEqual([trip]);
    expect(await db.syncedRecords.count()).toBe(0);
    expect(await db.syncState.get('state')).toBeUndefined();
  });

  it('v5 → v6: companions are names only, updatedAt untouched', async () => {
    const name = `test-${newId()}`;
    const trip = makeTrip();
    const { accountId, ...v5Me } = makeMeCompanion(trip.id, '2025-12-21T00:00:00.000Z');

    // A database as version 5 of the app left it.
    const v5 = new Dexie(name);
    v5.version(1).stores({ trips: 'id', scheduleItems: 'id, tripId' });
    v5.version(2).stores({
      companions: 'id, tripId',
      expenses: 'id, tripId, scheduleItemId',
      expenseShares: 'id, tripId, expenseId',
      settlements: 'id, tripId',
    });
    v5.version(3).stores({});
    v5.version(4).stores({});
    v5.version(5).stores({ syncedRecords: 'id, tripId', syncState: 'id' });
    await v5.table('trips').add(beforeV8(trip));
    await v5.table('companions').add(v5Me);
    v5.close();

    db = createTravelGoDB(name);
    expect(await db.companions.toArray()).toEqual([{ ...v5Me, accountId: null }]);
  });

  it('v7 → v8: a trip has its city as its cities and no countries, updatedAt untouched', async () => {
    const name = `test-${newId()}`;
    const trip = makeTrip({
      cities: [{ name: '오사카', placeId: 'osaka', location: { lat: 34.69, lng: 135.5 }, fetchedAt: '2025-12-30T00:00:00.000Z' }],
      updatedAt: '2025-12-21T00:00:00.000Z',
    });

    // A database as version 7 of the app left it.
    const v7 = new Dexie(name);
    v7.version(1).stores({ trips: 'id', scheduleItems: 'id, tripId' });
    v7.version(2).stores({
      companions: 'id, tripId',
      expenses: 'id, tripId, scheduleItemId',
      expenseShares: 'id, tripId, expenseId',
      settlements: 'id, tripId',
    });
    v7.version(5).stores({ syncedRecords: 'id, tripId', syncState: 'id' });
    v7.version(7).stores({ visitedCountries: 'id' });
    await v7.table('trips').add(beforeV8(trip));
    v7.close();

    db = createTravelGoDB(name);
    expect(await db.trips.toArray()).toEqual([trip]);
  });

  it('v8 → v9: an expense has its one payer as its payers, updatedAt untouched', async () => {
    const name = `test-${newId()}`;
    const trip = makeTrip();
    const me = makeMeCompanion(trip.id, trip.createdAt);
    const { shares, payerIds, ...expense } = makeExpense(
      { tripId: trip.id, payerIds: [me.id], amount: 5_000, updatedAt: '2025-12-21T00:00:00.000Z' },
      [{ companionId: me.id, weight: 1, amount: 5_000 }],
    );

    // A database as version 8 of the app left it.
    const v8 = new Dexie(name);
    v8.version(1).stores({ trips: 'id', scheduleItems: 'id, tripId' });
    v8.version(2).stores({
      companions: 'id, tripId',
      expenses: 'id, tripId, scheduleItemId',
      expenseShares: 'id, tripId, expenseId',
      settlements: 'id, tripId',
    });
    v8.version(5).stores({ syncedRecords: 'id, tripId', syncState: 'id' });
    v8.version(7).stores({ visitedCountries: 'id' });
    v8.version(8).stores({});
    await v8.table('expenses').add({ ...expense, payerId: payerIds[0] });
    v8.close();

    db = createTravelGoDB(name);
    expect(await db.expenses.toArray()).toEqual([{ ...expense, payerIds }]);
  });

  it('v9 → v10: schedule items are no flights, updatedAt untouched', async () => {
    const name = `test-${newId()}`;
    const trip = makeTrip();
    const { flight, ...item } = makeItem({
      tripId: trip.id,
      place: namedPlace('KE723'),
      updatedAt: '2025-12-21T00:00:00.000Z',
    });

    // A database as version 9 of the app left it.
    const v9 = new Dexie(name);
    v9.version(1).stores({ trips: 'id', scheduleItems: 'id, tripId' });
    v9.version(2).stores({
      companions: 'id, tripId',
      expenses: 'id, tripId, scheduleItemId',
      expenseShares: 'id, tripId, expenseId',
      settlements: 'id, tripId',
    });
    v9.version(5).stores({ syncedRecords: 'id, tripId', syncState: 'id' });
    v9.version(7).stores({ visitedCountries: 'id' });
    v9.version(9).stores({});
    await v9.table('scheduleItems').add(item);
    v9.close();

    db = createTravelGoDB(name);
    expect(await db.scheduleItems.toArray()).toEqual([{ ...item, flight: null }]);
    expect(flight).toBeNull();
  });

  it('v10 → v11: an expense has its memo (shown as its title) as its title, updatedAt untouched', async () => {
    const name = `test-${newId()}`;
    const trip = makeTrip();
    const me = makeMeCompanion(trip.id, trip.createdAt);
    const { shares, title, ...expense } = makeExpense(
      {
        tripId: trip.id,
        payerIds: [me.id],
        amount: 5_000,
        memo: '타코야키',
        updatedAt: '2025-12-21T00:00:00.000Z',
      },
      [{ companionId: me.id, weight: 1, amount: 5_000 }],
    );

    // A database as version 10 of the app left it.
    const v10 = new Dexie(name);
    v10.version(1).stores({ trips: 'id', scheduleItems: 'id, tripId' });
    v10.version(2).stores({
      companions: 'id, tripId',
      expenses: 'id, tripId, scheduleItemId',
      expenseShares: 'id, tripId, expenseId',
      settlements: 'id, tripId',
    });
    v10.version(5).stores({ syncedRecords: 'id, tripId', syncState: 'id' });
    v10.version(7).stores({ visitedCountries: 'id' });
    v10.version(10).stores({});
    await v10.table('expenses').add(expense);
    v10.close();

    db = createTravelGoDB(name);
    expect(await db.expenses.toArray()).toEqual([{ ...expense, title: '타코야키', memo: '' }]);
    expect(title).toBe('');
    expect(shares).toHaveLength(1);
  });
});
