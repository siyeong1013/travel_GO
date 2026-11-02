import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TravelGoDB } from '@/data/local';
import { type NewTrip, OutOfRangeItemsError, type Repositories } from '@/data/repositories';
import { createTripStore } from '@/features/trips/tripStore';
import { createTestRepositories, makePlace } from '@/test/fixtures';

let db: TravelGoDB;
let repos: Repositories;
let store: ReturnType<typeof createTripStore>;

beforeEach(() => {
  ({ db, repos } = createTestRepositories());
  store = createTripStore(repos);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete();
});

const newTrip = (title: string, startDate: string): NewTrip => ({
  title,
  city: { name: '오사카', placeId: null, location: null },
  startDate,
  endDate: startDate,
});

describe('tripStore', () => {
  it('loads once even when asked twice at the same time', async () => {
    await repos.trips.create(newTrip('B', '2026-12-01'));
    await repos.trips.create(newTrip('A', '2026-11-10'));
    const list = vi.spyOn(repos.trips, 'list');

    await Promise.all([store.getState().load(), store.getState().load()]);

    expect(list).toHaveBeenCalledTimes(1);
    expect(store.getState()).toMatchObject({ status: 'ready', error: null });
    expect(store.getState().trips.map((trip) => trip.title)).toEqual(['A', 'B']);
  });

  it('keeps the list sorted on create and drops removed trips', async () => {
    await store.getState().load();
    const later = await store.getState().create(newTrip('later', '2026-12-01'));
    await store.getState().create(newTrip('sooner', '2026-11-10'));

    expect(store.getState().trips.map((trip) => trip.title)).toEqual(['sooner', 'later']);

    await store.getState().remove(later.id);
    expect(store.getState().trips.map((trip) => trip.title)).toEqual(['sooner']);
    expect(await repos.trips.get(later.id)).toBeUndefined();
  });

  it('updates a trip in place, re-sorting, and passes date conflicts to the caller', async () => {
    await store.getState().load();
    const a = await store.getState().create(newTrip('A', '2026-11-10'));
    await store.getState().create(newTrip('B', '2026-12-01'));

    await store.getState().update(a.id, { startDate: '2027-01-01', endDate: '2027-01-02' });
    expect(store.getState().trips.map((trip) => trip.title)).toEqual(['B', 'A']);

    await repos.schedule.create({ tripId: a.id, date: '2027-01-02', place: makePlace('x') });
    await expect(store.getState().update(a.id, { endDate: '2027-01-01' })).rejects.toBeInstanceOf(
      OutOfRangeItemsError,
    );
    expect(store.getState().trips.find((trip) => trip.id === a.id)?.endDate).toBe('2027-01-02');
  });

  it('reports load failures with a user-facing message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(repos.trips, 'list').mockRejectedValue(new Error('IndexedDB unavailable'));

    await store.getState().load();

    expect(store.getState()).toMatchObject({
      status: 'error',
      error: '문제가 생겼어요. 잠시 후 다시 시도해 주세요.',
    });
  });
});
