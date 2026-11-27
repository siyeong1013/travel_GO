import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TravelGoDB } from '@/data/local';
import type { Companion, Trip } from '@/data/models';
import { EntityNotFoundError, type Repositories, ValidationError } from '@/data/repositories';
import {
  DEFAULT_CHECKLIST,
  defaultChecklistItems,
  MAX_CHECKLIST_ITEMS,
} from '@/data/rules/checklist';
import { createTestRepositories } from '@/test/fixtures';

let db: TravelGoDB;
let repos: Repositories;
let trip: Trip;
let me: Companion;

const createTrip = (title: string) =>
  repos.trips.create({
    title,
    cities: [{ name: '오사카', placeId: null, location: null, fetchedAt: null }],
    startDate: '2026-11-10',
    endDate: '2026-11-12',
  });

/** A trip with an empty checklist (a new one starts with the default list). */
async function newTrip(title: string) {
  const created = await createTrip(title);
  await db.checklistItems.where('tripId').equals(created.id).delete();
  return created;
}

beforeEach(async () => {
  ({ db, repos } = createTestRepositories());
  trip = await newTrip('오사카 여행');
  me = (await repos.companions.listByTrip(trip.id))[0]!;
});

afterEach(() => db.delete());

const texts = async (tripId = trip.id) =>
  (await repos.checklist.listByTrip(tripId)).map((item) => item.text);

describe('checklist', () => {
  it('adds items at the end, trimmed, unchecked and nobody’s', async () => {
    await repos.checklist.add(trip.id, ['  여권 ', '충전기']);
    const [added] = await repos.checklist.add(trip.id, ['우산']);

    expect(await texts()).toEqual(['여권', '충전기', '우산']);
    expect(added).toMatchObject({ tripId: trip.id, checked: false, assigneeId: null, order: 2 });
  });

  it('starts a new trip with the default list, its ids from the trip’s', async () => {
    const created = await createTrip('도쿄 여행');
    const items = await repos.checklist.listByTrip(created.id);
    expect(items.map((item) => item.text)).toEqual([...DEFAULT_CHECKLIST]);
    expect(items.every((item) => !item.checked && item.assigneeId === null)).toBe(true);
    expect(items.map((item) => item.id)).toEqual(
      defaultChecklistItems(created.id, created.createdAt).map((item) => item.id),
    );
  });

  it('adds the default list in its order', async () => {
    await repos.checklist.add(trip.id, [...DEFAULT_CHECKLIST]);
    expect(await texts()).toEqual([...DEFAULT_CHECKLIST]);
  });

  it('refuses empty or too long texts, too many items, and unknown trips', async () => {
    await expect(repos.checklist.add(trip.id, ['여권', '  '])).rejects.toBeInstanceOf(ValidationError);
    await expect(repos.checklist.add(trip.id, ['가'.repeat(101)])).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      repos.checklist.add(trip.id, Array.from({ length: MAX_CHECKLIST_ITEMS + 1 }, () => '물')),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(repos.checklist.add('missing', ['여권'])).rejects.toBeInstanceOf(
      EntityNotFoundError,
    );
    expect(await texts()).toEqual([]);
  });

  it('keeps adding after the last one when earlier ones were deleted', async () => {
    const [a, b] = await repos.checklist.add(trip.id, ['여권', '충전기']);
    await repos.checklist.delete(a!.id);
    await repos.checklist.delete(b!.id);
    await repos.checklist.add(trip.id, ['우산']);
    await repos.checklist.add(trip.id, ['옷']);
    expect(await texts()).toEqual(['우산', '옷']);
  });

  it('checks, renames and assigns; an unchanged update keeps updatedAt', async () => {
    const [item] = await repos.checklist.add(trip.id, ['드라이기']);
    const friend = await repos.companions.create({ tripId: trip.id, name: '철수' });

    const checked = await repos.checklist.update(item!.id, { checked: true });
    expect(checked.checked).toBe(true);
    expect(checked.updatedAt > item!.updatedAt).toBe(true);

    const renamed = await repos.checklist.update(item!.id, { text: ' 고데기 ', assigneeId: friend.id });
    expect(renamed).toMatchObject({ text: '고데기', assigneeId: friend.id, checked: true });

    const same = await repos.checklist.update(item!.id, { text: '고데기', checked: true });
    expect(same.updatedAt).toBe(renamed.updatedAt);
  });

  it('assigns only a companion of the same trip', async () => {
    const [item] = await repos.checklist.add(trip.id, ['드라이기']);
    const other = await newTrip('도쿄 여행');
    const stranger = (await repos.companions.listByTrip(other.id))[0]!;
    await expect(
      repos.checklist.update(item!.id, { assigneeId: stranger.id }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(repos.checklist.update('missing', { checked: true })).rejects.toBeInstanceOf(
      EntityNotFoundError,
    );
  });

  it('unassigns what a deleted companion was to bring', async () => {
    const friend = await repos.companions.create({ tripId: trip.id, name: '철수' });
    const [dryer, passport] = await repos.checklist.add(trip.id, ['드라이기', '여권']);
    await repos.checklist.update(dryer!.id, { assigneeId: friend.id });
    await repos.checklist.update(passport!.id, { assigneeId: me.id });

    await repos.companions.delete(friend.id);

    const items = await repos.checklist.listByTrip(trip.id);
    expect(items.map((item) => item.assigneeId)).toEqual([null, me.id]);
  });

  it('puts a deleted item back where it was', async () => {
    const items = await repos.checklist.add(trip.id, ['여권', '충전기', '우산']);
    await repos.checklist.delete(items[1]!.id);
    expect(await texts()).toEqual(['여권', '우산']);

    await repos.checklist.restore(items[1]!);
    expect(await texts()).toEqual(['여권', '충전기', '우산']);
  });

  it('copies another trip’s items, unchecked and nobody’s', async () => {
    const before = await newTrip('지난 여행');
    const [passport] = await repos.checklist.add(before.id, ['여권', '선크림']);
    await repos.checklist.update(passport!.id, { checked: true });
    await repos.checklist.add(trip.id, ['우산']);

    await repos.checklist.copyFrom(before.id, trip.id);

    const items = await repos.checklist.listByTrip(trip.id);
    expect(items.map((item) => [item.text, item.checked])).toEqual([
      ['우산', false],
      ['여권', false],
      ['선크림', false],
    ]);
    expect(await repos.checklist.countByTrip()).toEqual({ [trip.id]: 3, [before.id]: 2 });
  });

  it('goes with its trip', async () => {
    await repos.checklist.add(trip.id, ['여권']);
    await repos.trips.delete(trip.id);
    expect(await db.checklistItems.count()).toBe(0);
  });
});
