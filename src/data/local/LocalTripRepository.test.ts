import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TravelGoDB } from '@/data/local';
import {
  type NewTrip,
  OutOfRangeItemsError,
  type Repositories,
  ValidationError,
} from '@/data/repositories';
import { COVER_IMAGE_MAX_LENGTH } from '@/data/rules/validation';
import { newId } from '@/lib/id';
import { createTestRepositories, makeCover, makePlace } from '@/test/fixtures';

let db: TravelGoDB;
let repos: Repositories;

beforeEach(() => {
  ({ db, repos } = createTestRepositories());
});

afterEach(() => db.delete());

const osaka: NewTrip = {
  title: '  오사카 여행  ',
  cities: [{ name: '오사카', placeId: null, location: null, fetchedAt: null }],
  startDate: '2026-11-10',
  endDate: '2026-11-12',
};

describe('LocalTripRepository', () => {
  it('creates, gets and lists trips by start date', async () => {
    const later = await repos.trips.create({ ...osaka, startDate: '2026-12-01', endDate: '2026-12-03' });
    const sooner = await repos.trips.create(osaka);

    expect(sooner.title).toBe('오사카 여행');
    expect(sooner.createdAt).toBe(sooner.updatedAt);
    expect(await repos.trips.get(sooner.id)).toEqual(sooner);
    expect((await repos.trips.list()).map((trip) => trip.id)).toEqual([sooner.id, later.id]);
  });

  it('rejects invalid trips', async () => {
    await expect(repos.trips.create({ ...osaka, title: ' ' })).rejects.toBeInstanceOf(ValidationError);
    await expect(repos.trips.create({ ...osaka, endDate: '2026-11-09' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(repos.trips.create({ ...osaka, startDate: '2026/11/10' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('keeps the countries and cities in the order picked; one city at least, each country once', async () => {
    const kyoto = { name: ' 교토 ', placeId: null, location: null, fetchedAt: null };
    const trip = await repos.trips.create({
      ...osaka,
      countries: ['JP', 'KR'],
      cities: [...osaka.cities, kyoto],
    });
    expect(trip.countries).toEqual(['JP', 'KR']);
    expect(trip.cities.map((city) => city.name)).toEqual(['오사카', '교토']);
    expect((await repos.trips.create(osaka)).countries).toEqual([]);

    for (const bad of [
      { cities: [] },
      { cities: [{ ...kyoto, name: ' ' }] },
      { countries: ['japan'] },
      { countries: ['JP', 'JP'] },
      { countries: Array.from({ length: 16 }, (_, i) => `A${String.fromCharCode(65 + i)}`) },
    ]) {
      await expect(repos.trips.create({ ...osaka, ...bad })).rejects.toBeInstanceOf(ValidationError);
    }
    await expect(repos.trips.update(trip.id, { cities: [] })).rejects.toBeInstanceOf(ValidationError);
    expect((await repos.trips.update(trip.id, { countries: ['TW'] })).countries).toEqual(['TW']);
  });

  it('takes an id made up front (the form shows the cover color it picks), if it is a new UUID', async () => {
    const id = newId();
    const trip = await repos.trips.create(osaka, { id });
    expect(trip.id).toBe(id);
    expect(await repos.trips.get(id)).toEqual(trip);

    for (const bad of ['', 'trip-1', id.toUpperCase()]) {
      await expect(repos.trips.create(osaka, { id: bad })).rejects.toBeInstanceOf(ValidationError);
    }
    await expect(repos.trips.create({ ...osaka, title: '다른 여행' }, { id })).rejects.toThrow();
    expect(await repos.trips.list()).toEqual([trip]);
  });

  it('updates fields and bumps updatedAt', async () => {
    const trip = await repos.trips.create(osaka);
    const updated = await repos.trips.update(trip.id, { title: '간사이 여행' });

    expect(updated).toMatchObject({ title: '간사이 여행', startDate: trip.startDate });
    expect(updated.updatedAt > trip.updatedAt).toBe(true);
    expect(await repos.trips.get(trip.id)).toEqual(updated);
  });

  it('keeps a cover photo, changed or removed like any other field', async () => {
    const plain = await repos.trips.create(osaka);
    expect(plain.cover).toBeNull();

    const trip = await repos.trips.create({ ...osaka, cover: makeCover('castle') });
    expect(await repos.trips.get(trip.id)).toMatchObject({ cover: makeCover('castle') });

    // Other edits leave it alone.
    expect((await repos.trips.update(trip.id, { budget: 100_000 })).cover).toEqual(makeCover('castle'));

    const changed = await repos.trips.update(trip.id, { cover: makeCover('tower') });
    expect(changed.cover).toEqual(makeCover('tower'));
    const removed = await repos.trips.update(trip.id, { cover: null });
    expect(removed.cover).toBeNull();
    expect(removed.updatedAt > changed.updatedAt).toBe(true);
    expect(await repos.trips.get(trip.id)).toEqual(removed);
  });

  it('takes only images held in the data as covers', async () => {
    const cover = makeCover();
    for (const bad of [
      { ...cover, image: 'https://example.com/tracker.jpg' },
      { ...cover, image: 'data:image/svg+xml;base64,PHN2Zz4=' },
      { ...cover, image: 'data:image/jpeg;base64,not base64!' },
      { ...cover, thumbnail: 'javascript:alert(1)' },
      { ...cover, image: `data:image/jpeg;base64,${'A'.repeat(COVER_IMAGE_MAX_LENGTH)}` },
    ]) {
      await expect(repos.trips.create({ ...osaka, cover: bad })).rejects.toBeInstanceOf(
        ValidationError,
      );
    }
    const trip = await repos.trips.create(osaka);
    await expect(
      repos.trips.update(trip.id, { cover: { ...cover, thumbnail: '' } }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  describe('shrinking the dates', () => {
    async function tripWithItems() {
      const trip = await repos.trips.create(osaka);
      const add = (date: string | null, name: string) =>
        repos.schedule.create({ tripId: trip.id, date, place: makePlace(name) });
      await add('2026-11-10', 'day1');
      await add('2026-11-12', 'day3-a');
      await add('2026-11-12', 'day3-b');
      await add(null, 'inbox');
      return trip;
    }

    const names = async (tripId: string) =>
      (await repos.schedule.listByTrip(tripId)).map((item) => [item.date, item.order, item.place.name]);

    it('refuses without a decision and changes nothing', async () => {
      const trip = await tripWithItems();
      const before = await names(trip.id);

      const error = await repos.trips
        .update(trip.id, { endDate: '2026-11-11' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(OutOfRangeItemsError);
      expect(error).toMatchObject({ count: 2, dates: ['2026-11-12'] });
      expect(await repos.trips.get(trip.id)).toEqual(trip);
      expect(await names(trip.id)).toEqual(before);
    });

    it('can move the items to the end of the inbox', async () => {
      const trip = await tripWithItems();
      await repos.trips.update(trip.id, { endDate: '2026-11-11' }, { outOfRangeItems: 'moveToInbox' });

      expect(await names(trip.id)).toEqual([
        ['2026-11-10', 0, 'day1'],
        [null, 0, 'inbox'],
        [null, 1, 'day3-a'],
        [null, 2, 'day3-b'],
      ]);
    });

    it('can delete the items', async () => {
      const trip = await tripWithItems();
      await repos.trips.update(trip.id, { endDate: '2026-11-11' }, { outOfRangeItems: 'delete' });

      expect(await names(trip.id)).toEqual([
        ['2026-11-10', 0, 'day1'],
        [null, 0, 'inbox'],
      ]);
    });

    it('does not ask when extending the dates', async () => {
      const trip = await tripWithItems();
      const updated = await repos.trips.update(trip.id, { endDate: '2026-11-20' });
      expect(updated.endDate).toBe('2026-11-20');
    });
  });

  it('deletes a trip together with its items', async () => {
    const trip = await repos.trips.create(osaka);
    const other = await repos.trips.create(osaka);
    await repos.schedule.create({ tripId: trip.id, date: null, place: makePlace('a') });
    await repos.schedule.create({ tripId: other.id, date: null, place: makePlace('b') });

    await repos.trips.delete(trip.id);

    expect(await repos.trips.get(trip.id)).toBeUndefined();
    expect(await repos.schedule.listByTrip(trip.id)).toEqual([]);
    expect(await repos.schedule.listByTrip(other.id)).toHaveLength(1);
  });
});

describe("LocalTripRepository: a city's Google coordinates are kept for 30 days", () => {
  // The test clock starts at 2026-01-01T00:00:00Z.
  const city = (fetchedAt: string) => ({
    name: '오사카',
    placeId: 'osaka',
    location: { lat: 34.69, lng: 135.5 },
    fetchedAt,
  });

  it('removes them once expired when getting or listing, keeping updatedAt', async () => {
    const created = await repos.trips.create({ ...osaka, cities: [city('2025-12-30T00:00:00.000Z')] });
    const expired = { ...created, cities: [city('2025-12-01T00:00:00.000Z')] };
    await db.trips.put(expired);

    const cleared = {
      ...expired,
      cities: [{ ...expired.cities[0]!, location: null, fetchedAt: null }],
    };
    expect(await repos.trips.get(created.id)).toEqual(cleared);
    expect(await db.trips.get(created.id)).toEqual(cleared);

    await db.trips.put(expired);
    expect(await repos.trips.list()).toEqual([cleared]);
    await db.trips.put(expired);
    await repos.trips.expirePlaceData();
    expect(await db.trips.get(created.id)).toEqual(cleared);
  });

  it('refreshes them for the same place only, keeping updatedAt', async () => {
    const created = await repos.trips.create({ ...osaka, cities: [city('2025-12-30T00:00:00.000Z')] });
    const fresh = { placeId: 'osaka', address: null, location: { lat: 1, lng: 2 }, fetchedAt: '2026-01-01T12:00:00.000Z' };

    const refreshed = await repos.trips.refreshCity(created.id, fresh);
    expect(refreshed).toEqual({
      ...created,
      cities: [{ ...created.cities[0]!, location: { lat: 1, lng: 2 }, fetchedAt: fresh.fetchedAt }],
    });
    expect(await repos.trips.get(created.id)).toEqual(refreshed);

    expect(await repos.trips.refreshCity(created.id, { ...fresh, placeId: 'kyoto' })).toEqual(refreshed);
    expect(await repos.trips.refreshCity('missing', fresh)).toBeUndefined();
  });
});
