import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TravelGoDB } from '@/data/local';
import type { ScheduleItem, Trip } from '@/data/models';
import { EntityNotFoundError, type Repositories, ValidationError } from '@/data/repositories';
import { newId } from '@/lib/id';
import { createTestRepositories, makeItem, makePlace } from '@/test/fixtures';

let db: TravelGoDB;
let repos: Repositories;
let trip: Trip;

const DAY1 = '2026-11-10';
const DAY2 = '2026-11-11';

beforeEach(async () => {
  ({ db, repos } = createTestRepositories());
  trip = await repos.trips.create({
    title: '오사카 여행',
    city: { name: '오사카', placeId: null, location: null, fetchedAt: null },
    startDate: DAY1,
    endDate: '2026-11-12',
  });
});

afterEach(() => db.delete());

const add = (date: string | null, name: string) =>
  repos.schedule.create({ tripId: trip.id, date, place: makePlace(name) });

/** `{ date|inbox: [names in order] }`, asserting orders are 0..n-1. */
async function layout() {
  const groups: Record<string, string[]> = {};
  for (const item of await repos.schedule.listByTrip(trip.id)) {
    const group = (groups[item.date ?? 'inbox'] ??= []);
    expect(item.order).toBe(group.length);
    group.push(item.place.name);
  }
  return groups;
}

describe('LocalScheduleRepository', () => {
  it('appends new items to the end of their day or the inbox', async () => {
    const first = await add(DAY1, 'a');
    await add(DAY1, 'b');
    await add(null, 'inbox');

    expect(first).toMatchObject({ tripId: trip.id, date: DAY1, order: 0, time: null, memo: '' });
    expect(await layout()).toEqual({ [DAY1]: ['a', 'b'], inbox: ['inbox'] });
  });

  it('rejects items outside the trip or for unknown trips', async () => {
    await expect(add('2026-11-13', 'late')).rejects.toBeInstanceOf(ValidationError);
    await expect(
      repos.schedule.create({ tripId: 'missing', date: null, place: makePlace('x') }),
    ).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(
      repos.schedule.create({ tripId: trip.id, date: null, place: makePlace('   ') }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('updates time and memo', async () => {
    const item = await add(DAY1, 'a');
    const updated = await repos.schedule.update(item.id, { time: '09:30', memo: '입장권 예매' });

    expect(updated).toMatchObject({ time: '09:30', memo: '입장권 예매' });
    expect(updated.updatedAt > item.updatedAt).toBe(true);
    expect((await repos.schedule.update(item.id, { time: '' })).time).toBeNull();
    await expect(repos.schedule.update(item.id, { time: '9:30' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('moves within a day, across days and through the inbox', async () => {
    const a = await add(DAY1, 'a');
    await add(DAY1, 'b');
    const c = await add(DAY1, 'c');
    const inbox = await add(null, 'inbox');

    await repos.schedule.move(c.id, { date: DAY1, index: 0 });
    expect(await layout()).toEqual({ [DAY1]: ['c', 'a', 'b'], inbox: ['inbox'] });

    await repos.schedule.move(a.id, { date: DAY2, index: 0 });
    expect(await layout()).toEqual({ [DAY1]: ['c', 'b'], [DAY2]: ['a'], inbox: ['inbox'] });

    await repos.schedule.move(inbox.id, { date: DAY2, index: 0 });
    await repos.schedule.move(c.id, { date: null, index: 0 });
    expect(await layout()).toEqual({ [DAY1]: ['b'], [DAY2]: ['inbox', 'a'], inbox: ['c'] });
  });

  it('rejects moves outside the trip', async () => {
    const a = await add(DAY1, 'a');
    await expect(repos.schedule.move(a.id, { date: '2026-11-30', index: 0 })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(repos.schedule.move(a.id, { date: DAY1, index: -1 })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('closes the gap when deleting', async () => {
    const a = await add(DAY1, 'a');
    await add(DAY1, 'b');
    await add(DAY1, 'c');

    await repos.schedule.delete(a.id);
    await repos.schedule.delete(a.id); // deleting twice is a no-op

    expect(await layout()).toEqual({ [DAY1]: ['b', 'c'] });
  });
});

// The test clock starts at 2026-01-01T00:00:00Z.
const EXPIRED = '2025-12-01T00:00:00.000Z';
const RECENT = '2025-12-30T00:00:00.000Z';

describe("LocalScheduleRepository: Google's place data is kept for 30 days", () => {
  const stored = (name: string, fetchedAt: string, order = 0) =>
    makeItem({ tripId: trip.id, order, place: makePlace(name, { address: '주소', fetchedAt }) });
  const withoutData = (item: ScheduleItem): ScheduleItem => ({
    ...item,
    place: { ...item.place, address: null, location: null, fetchedAt: null },
  });

  it('removes expired data when listing, and from the database, keeping names and updatedAt', async () => {
    const old = stored('오사카성', EXPIRED);
    const recent = stored('도톤보리', RECENT, 1);
    await db.scheduleItems.bulkPut([old, recent]);

    expect(await repos.schedule.listByTrip(trip.id)).toEqual([withoutData(old), recent]);
    expect(await db.scheduleItems.get(old.id)).toEqual(withoutData(old));
  });

  it('removes it from every trip on app start', async () => {
    const other = await repos.trips.create({ ...trip, title: '교토 여행' });
    const old = stored('오사카성', EXPIRED);
    const elsewhere = { ...stored('교토역', EXPIRED), tripId: other.id };
    await db.scheduleItems.bulkPut([old, elsewhere]);

    await repos.schedule.expirePlaceData();
    expect(await db.scheduleItems.get(old.id)).toEqual(withoutData(old));
    expect(await db.scheduleItems.get(elsewhere.id)).toEqual(withoutData(elsewhere));
  });

  it('never stores expired data', async () => {
    const created = await repos.schedule.create({
      tripId: trip.id,
      date: DAY1,
      place: makePlace('오사카성', { fetchedAt: EXPIRED }),
    });
    expect(created.place).toMatchObject({ location: null, fetchedAt: null });
    const updated = await repos.schedule.update(created.id, {
      place: makePlace('오사카성', { fetchedAt: EXPIRED }),
    });
    expect(updated.place).toMatchObject({ location: null, fetchedAt: null });
  });

  it('writes refreshed data into the trip\'s items with that place, keeping names and updatedAt', async () => {
    const castle = stored('성 구경', RECENT);
    const sameAgain = { ...stored('천수각', RECENT, 1), place: { ...castle.place, name: '천수각' } };
    const other = stored('다른 곳', RECENT, 2);
    const otherTrip = await repos.trips.create({ ...trip, title: '교토 여행' });
    const elsewhere = { ...castle, id: newId(), tripId: otherTrip.id };
    await db.scheduleItems.bulkPut([castle, sameAgain, other, elsewhere]);

    const fresh = { address: '새 주소', location: { lat: 1, lng: 2 }, fetchedAt: '2026-01-01T12:00:00.000Z' };
    await repos.schedule.refreshPlaces(trip.id, [{ placeId: castle.place.placeId!, ...fresh }]);

    expect(await repos.schedule.listByTrip(trip.id)).toEqual([
      { ...castle, place: { ...castle.place, ...fresh } },
      { ...sameAgain, place: { ...sameAgain.place, ...fresh } },
      other,
    ]);
    expect(await db.scheduleItems.get(elsewhere.id)).toEqual(elsewhere);
  });
});
