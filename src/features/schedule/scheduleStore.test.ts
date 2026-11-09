import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TravelGoDB } from '@/data/local';
import type { Trip } from '@/data/models';
import { type Repositories, ValidationError } from '@/data/repositories';
import { createScheduleStore } from '@/features/schedule/scheduleStore';
import { createTestRepositories, makePlace } from '@/test/fixtures';

let db: TravelGoDB;
let repos: Repositories;
let store: ReturnType<typeof createScheduleStore>;
let trip: Trip;

const DAY1 = '2026-11-10';

beforeEach(async () => {
  ({ db, repos } = createTestRepositories());
  store = createScheduleStore(repos);
  trip = await repos.trips.create({
    title: '오사카 여행',
    cities: [{ name: '오사카', placeId: null, location: null, fetchedAt: null }],
    startDate: DAY1,
    endDate: '2026-11-12',
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete();
});

const add = (name: string, date: string | null = DAY1) =>
  store.getState().add({ tripId: trip.id, date, place: makePlace(name) });

const names = () => store.getState().items.map((item) => item.place.name);

describe('scheduleStore', () => {
  it('adds items to the end of their group', async () => {
    await store.getState().load(trip.id);
    await add('a');
    await add('b');
    await add('inbox', null);

    expect(store.getState()).toMatchObject({ tripId: trip.id, status: 'ready' });
    expect(store.getState().items.map((item) => [item.date, item.order, item.place.name])).toEqual([
      [DAY1, 0, 'a'],
      [DAY1, 1, 'b'],
      [null, 0, 'inbox'],
    ]);
  });

  it('updates fields in place', async () => {
    await store.getState().load(trip.id);
    const item = await add('a');

    await store.getState().update(item.id, { time: '09:30', memo: '입장권' });

    expect(store.getState().items[0]).toMatchObject({ time: '09:30', memo: '입장권' });
  });

  it('shows a move before it is saved, and matches storage afterwards', async () => {
    await store.getState().load(trip.id);
    await add('a');
    const b = await add('b');

    let release!: () => void;
    const saved = repos.schedule.move;
    vi.spyOn(repos.schedule, 'move').mockImplementation(async (...args) => {
      await new Promise<void>((resolve) => (release = resolve));
      return saved(...args);
    });

    const moving = store.getState().move(b.id, { date: DAY1, index: 0 });
    expect(names()).toEqual(['b', 'a']);

    release();
    await moving;
    expect(names()).toEqual(['b', 'a']);
    expect(store.getState().items).toEqual(await repos.schedule.listByTrip(trip.id));
  });

  it('rolls back a move that fails to save', async () => {
    await store.getState().load(trip.id);
    await add('a');
    const b = await add('b');
    vi.spyOn(repos.schedule, 'move').mockRejectedValue(new ValidationError('nope'));

    await expect(store.getState().move(b.id, { date: null, index: 0 })).rejects.toThrow('nope');

    expect(names()).toEqual(['a', 'b']);
    expect(store.getState().items.every((item) => item.date === DAY1)).toBe(true);
  });

  it('removes items and closes the gap', async () => {
    await store.getState().load(trip.id);
    const a = await add('a');
    await add('b');

    await store.getState().remove(a.id);

    expect(store.getState().items.map((item) => [item.order, item.place.name])).toEqual([[0, 'b']]);
  });

  it('removes several items at once', async () => {
    await store.getState().load(trip.id);
    const a = await add('a');
    await add('b');
    const c = await add('c');

    await store.getState().removeMany([a.id, c.id]);

    expect(store.getState().items.map((item) => [item.order, item.place.name])).toEqual([[0, 'b']]);
  });

  it('ignores a late answer for a trip it already switched away from', async () => {
    await add('from the first trip');
    const other = await repos.trips.create({ ...trip, title: '다른 여행' });

    let release!: () => void;
    const list = repos.schedule.listByTrip;
    vi.spyOn(repos.schedule, 'listByTrip').mockImplementationOnce(async (tripId) => {
      await new Promise<void>((resolve) => (release = resolve));
      return list(tripId);
    });

    const first = store.getState().load(trip.id);
    await store.getState().load(other.id);
    release();
    await first;

    expect(store.getState()).toMatchObject({ tripId: other.id, status: 'ready', items: [] });
  });
});
