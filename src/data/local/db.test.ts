import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocalRepositories, createTravelGoDB, type TravelGoDB } from '@/data/local';
import { meCompanionId } from '@/data/rules/companion';
import { newId } from '@/lib/id';
import { makeItem, makeTrip, testClock } from '@/test/fixtures';

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
});
