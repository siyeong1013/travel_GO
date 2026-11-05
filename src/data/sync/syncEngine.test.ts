import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataLayer } from '@/data/dataLayer';
import { createTravelGoDB, type TravelGoDB } from '@/data/local';
import type { ID, Trip } from '@/data/models';
import type { NewExpense } from '@/data/repositories';
import { meCompanionId } from '@/data/rules/companion';
import { SYNC_FORMAT } from '@/data/sync/records';
import type { SyncServer } from '@/data/sync/syncEngine';
import type { Clock } from '@/lib/dates';
import { newId } from '@/lib/id';
import { namedPlace, testClock, typedCity } from '@/test/fixtures';
import { createSyncDatabase, type SyncDatabase } from '@/test/syncDatabase';

// Two devices of one account syncing through the real server SQL (PGlite).

const ME = 'aaaaaaaa-0000-4000-8000-000000000001';
const SOMEONE = 'bbbbbbbb-0000-4000-8000-000000000002';

let server: SyncDatabase;
/** Shared by the devices, like the time of day. */
let clock: Clock;
const databases: TravelGoDB[] = [];

beforeEach(async () => {
  server = await createSyncDatabase();
  await server.addUser(ME);
  await server.addUser(SOMEONE);
  clock = testClock();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await server.close();
  for (const db of databases.splice(0)) await db.delete();
});

function device(
  deviceClock: Clock = () => clock(),
  connect = async (userId: string): Promise<SyncServer> => server.serverFor(userId),
) {
  const db = createTravelGoDB(`test-${newId()}`);
  databases.push(db);
  const layer = createDataLayer(db, connect, deviceClock);
  return { db, repos: layer.repositories, engine: layer.syncEngine, sync: () => layer.syncEngine.sync(ME) };
}

type Device = ReturnType<typeof device>;

function addTrip(on: Device, title = 'Osaka', cover: Trip['cover'] = null) {
  return on.repos.trips.create({
    title,
    city: typedCity('Osaka'),
    startDate: '2026-12-01',
    endDate: '2026-12-03',
    cover,
  });
}

function addItem(on: Device, tripId: ID, name: string, date: string | null = '2026-12-01') {
  return on.repos.schedule.create({ tripId, date, place: namedPlace(name) });
}

function expenseOf(tripId: ID, amount: number): NewExpense {
  return {
    tripId,
    date: '2026-12-01',
    amount,
    currency: 'KRW',
    exchangeRate: { rate: '1', source: 'same', fetchedAt: null },
    category: 'food',
    paymentMethod: 'card',
    payerId: meCompanionId(tripId),
    splitMethod: 'equal',
    participants: [{ companionId: meCompanionId(tripId), value: null }],
    memo: '',
    scheduleItemId: null,
  };
}

const names = async (on: Device, tripId: ID) =>
  (await on.repos.schedule.listByTrip(tripId)).map((item) => [item.place.name, item.date, item.order]);

describe('sync', () => {
  it('puts the device’s trips on the account the first time, and another device gets them', async () => {
    const phone = device();
    const trip = await addTrip(phone);
    await addItem(phone, trip.id, '오사카성');
    await phone.repos.expenses.create(expenseOf(trip.id, 12000));
    expect(await phone.engine.pending()).toBe(4); // the trip, "나", the item, the expense

    expect(await phone.sync()).toEqual({ changed: false, pending: 0, needsUpdate: false });

    const laptop = device();
    expect(await laptop.sync()).toMatchObject({ changed: true, pending: 0 });
    expect((await laptop.repos.trips.list()).map((t) => t.title)).toEqual(['Osaka']);
    expect(await names(laptop, trip.id)).toEqual([['오사카성', '2026-12-01', 0]]);
    const [expense] = await laptop.repos.expenses.listByTrip(trip.id);
    expect(expense).toMatchObject({ amount: 12000, shares: [{ amount: 12000 }] });
    expect(await laptop.repos.companions.listByTrip(trip.id)).toHaveLength(1);
  });

  it('brings changes across both ways, and its own changes back are no news', async () => {
    const phone = device();
    const laptop = device();
    const trip = await addTrip(phone);
    const item = await addItem(phone, trip.id, '오사카성');
    await phone.sync();
    await laptop.sync();

    await laptop.repos.schedule.update(item.id, { memo: '입장권' });
    await laptop.sync();
    expect(await phone.sync()).toMatchObject({ changed: true });
    expect((await phone.repos.schedule.listByTrip(trip.id))[0]?.memo).toBe('입장권');

    await phone.repos.schedule.move(item.id, { date: '2026-12-02', index: 0 });
    await phone.sync();
    await laptop.sync();
    expect(await names(laptop, trip.id)).toEqual([['오사카성', '2026-12-02', 0]]);

    expect(await phone.sync()).toEqual({ changed: false, pending: 0, needsUpdate: false });
  });

  it('takes deletions to the other device', async () => {
    const phone = device();
    const laptop = device();
    const trip = await addTrip(phone);
    const item = await addItem(phone, trip.id, '오사카성');
    const expense = await phone.repos.expenses.create(expenseOf(trip.id, 5000));
    await phone.sync();
    await laptop.sync();

    await phone.repos.schedule.delete(item.id);
    await phone.repos.expenses.delete(expense.id);
    await phone.sync();
    await laptop.sync();

    expect(await laptop.repos.schedule.listByTrip(trip.id)).toEqual([]);
    expect(await laptop.repos.expenses.listByTrip(trip.id)).toEqual([]);
    expect(await laptop.db.expenseShares.count()).toBe(0);
  });

  it('deletes a trip everywhere with everything in it, over what was added to it meanwhile', async () => {
    const phone = device();
    const laptop = device();
    const trip = await addTrip(phone);
    await phone.sync();
    await laptop.sync();

    await phone.repos.trips.delete(trip.id);
    await addItem(laptop, trip.id, '유니버설'); // offline, before hearing of it
    await phone.sync();
    await laptop.sync();

    expect(await laptop.repos.trips.list()).toEqual([]);
    expect(await laptop.db.scheduleItems.count()).toBe(0);
    expect(await laptop.engine.pending()).toBe(0);
    const rows = await server.as(ME, (tx) => tx.query('select kind, deleted from public.records'));
    expect(rows.rows).toEqual([{ kind: 'trip', deleted: true }]);
  });

  it('keeps the later of two changes to the same record', async () => {
    const phone = device();
    const laptop = device();
    const trip = await addTrip(phone);
    const item = await addItem(phone, trip.id, '오사카성');
    await phone.sync();
    await laptop.sync();

    await phone.repos.schedule.update(item.id, { memo: 'phone, earlier' });
    await laptop.repos.schedule.update(item.id, { memo: 'laptop, later' });
    await laptop.sync();
    await phone.sync();
    await laptop.sync();

    for (const on of [phone, laptop]) {
      expect((await on.repos.schedule.listByTrip(trip.id))[0]?.memo).toBe('laptop, later');
      expect(await on.engine.pending()).toBe(0);
    }
  });

  it('takes the server’s copy when a later one got there between reading and sending', async () => {
    let interrupt: (() => Promise<unknown>) | null = null;
    const phone = device(undefined, async (userId) => {
      const real = server.serverFor(userId);
      return {
        pull: real.pull,
        async push(changes) {
          const first = interrupt;
          interrupt = null;
          await first?.();
          return real.push(changes);
        },
      };
    });
    const laptop = device();
    const trip = await addTrip(phone);
    const item = await addItem(phone, trip.id, '오사카성');
    await phone.sync();
    await laptop.sync();

    await phone.repos.schedule.update(item.id, { memo: 'phone, earlier' });
    await laptop.repos.schedule.update(item.id, { memo: 'laptop, later' });
    interrupt = () => laptop.sync();
    expect(await phone.sync()).toMatchObject({ changed: true, pending: 0 });

    expect((await phone.repos.schedule.listByTrip(trip.id))[0]?.memo).toBe('laptop, later');
  });

  it('counts an edit of what it last saw even when its clock is behind', async () => {
    const phone = device();
    const behind = () => new Date(Date.parse(clock()) - 60 * 60 * 1000).toISOString();
    const laptop = device(behind);
    const trip = await addTrip(phone);
    const item = await addItem(phone, trip.id, '오사카성');
    await phone.sync();
    await laptop.sync();

    await laptop.repos.schedule.update(item.id, { memo: 'from the laptop' });
    await laptop.sync();
    await phone.sync();

    for (const on of [phone, laptop]) {
      expect((await on.repos.schedule.listByTrip(trip.id))[0]?.memo).toBe('from the laptop');
      expect(await on.engine.pending()).toBe(0);
    }
  });

  it('repairs a day whose order two devices changed at once', async () => {
    const phone = device();
    const laptop = device();
    const trip = await addTrip(phone);
    await phone.sync();
    await laptop.sync();

    await addItem(phone, trip.id, '오사카성');
    await addItem(laptop, trip.id, '도톤보리');
    await phone.sync();
    await laptop.sync();
    await phone.sync();

    const day = await names(laptop, trip.id);
    expect(day.map(([, date, order]) => [date, order])).toEqual([
      ['2026-12-01', 0],
      ['2026-12-01', 1],
    ]);
    expect(await names(phone, trip.id)).toEqual(day);
  });

  it('takes the trips off the device on sign-out, and brings them back on sign-in', async () => {
    const phone = device();
    const trip = await addTrip(phone);
    await addItem(phone, trip.id, '오사카성');
    await phone.sync();

    await phone.engine.forget();
    expect(await phone.repos.trips.list()).toEqual([]);
    expect(await phone.db.syncedRecords.count()).toBe(0);

    expect(await phone.sync()).toMatchObject({ changed: true, pending: 0 });
    expect((await phone.repos.trips.list()).map((t) => t.id)).toEqual([trip.id]);
    expect(await names(phone, trip.id)).toEqual([['오사카성', '2026-12-01', 0]]);
  });

  it('takes another account’s trips off the device before signing in', async () => {
    const phone = device();
    await addTrip(phone, 'Mine');
    await phone.sync();

    expect(await phone.engine.sync(SOMEONE)).toMatchObject({ changed: true, pending: 0 });
    expect(await phone.repos.trips.list()).toEqual([]);
    const theirs = await server.as(SOMEONE, (tx) => tx.query('select id from public.records'));
    expect(theirs.rows).toEqual([]);
  });

  it('sends big cover photos a few at a time', async () => {
    const pushes: number[] = [];
    const phone = device(undefined, async (userId) => {
      const real = server.serverFor(userId);
      return {
        pull: real.pull,
        push: (changes) => {
          pushes.push(changes.length);
          return real.push(changes);
        },
      };
    });
    const photo = (n: number) => ({
      image: `data:image/jpeg;base64,${String(n).repeat(2_000_000)}`,
      thumbnail: 'data:image/jpeg;base64,AAAA',
    });
    for (const n of [1, 2, 3]) await addTrip(phone, `Trip ${n}`, photo(n));
    await phone.sync();

    const laptop = device();
    await laptop.sync();
    const covers = (await laptop.repos.trips.list()).map((t) => t.cover?.image.length);
    expect(covers).toEqual([2_000_023, 2_000_023, 2_000_023]);
    // Two photos are more than one push takes: the trips, then each one's "나".
    expect(pushes).toEqual([1, 1, 4]);
  });

  it('takes the browser’s lock, so two tabs don’t sync at once', async () => {
    const request = vi.fn((_name: string, work: () => Promise<unknown>) => work());
    vi.stubGlobal('navigator', { locks: { request } });
    const phone = device();
    await addTrip(phone);
    expect(await phone.sync()).toMatchObject({ pending: 0 });
    expect(request).toHaveBeenCalledWith('travel-go:sync', expect.any(Function));
  });

  it('waits for an update before reading what a newer app version wrote', async () => {
    const phone = device();
    const trip = await addTrip(phone);
    await phone.sync();
    const NEWER = '22222222-0000-4000-8000-000000000001';
    await server.serverFor(ME).push([
      {
        id: NEWER,
        tripId: trip.id,
        kind: 'scheduleItem',
        format: SYNC_FORMAT + 1,
        updatedAt: '2026-06-01T00:00:00.000Z',
        deleted: false,
        data: { id: NEWER, tripId: trip.id, updatedAt: '2026-06-01T00:00:00.000Z' } as never,
      },
    ]);

    const laptop = device();
    expect(await laptop.sync()).toMatchObject({ needsUpdate: true });
    expect((await laptop.repos.trips.list()).map((t) => t.id)).toEqual([trip.id]);
    expect(await laptop.repos.schedule.listByTrip(trip.id)).toEqual([]);
  });
});
