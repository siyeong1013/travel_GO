import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TravelGoDB } from '@/data/local';
import type { Trip } from '@/data/models';
import { EntityNotFoundError, type Repositories, ValidationError } from '@/data/repositories';
import { createTestRepositories, makePlace } from '@/test/fixtures';

let db: TravelGoDB;
let repos: Repositories;
let trip: Trip;

const DAY1 = '2026-11-10';
const DAY2 = '2026-11-11';

beforeEach(async () => {
  ({ db, repos } = createTestRepositories());
  trip = await repos.trips.create({
    title: '오사카 여행',
    city: { name: '오사카', placeId: null, location: null },
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
