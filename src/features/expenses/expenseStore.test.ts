import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TravelGoDB } from '@/data/local';
import type { Companion, Trip } from '@/data/models';
import { CompanionInUseError, type NewExpense, type Repositories } from '@/data/repositories';
import { createExpenseStore } from '@/features/expenses/expenseStore';
import { createTestRepositories } from '@/test/fixtures';

let db: TravelGoDB;
let repos: Repositories;
let store: ReturnType<typeof createExpenseStore>;
let trip: Trip;
let me: Companion;

const newTrip = (title: string) =>
  repos.trips.create({
    title,
    city: { name: '오사카', placeId: null, location: null },
    startDate: '2026-11-10',
    endDate: '2026-11-12',
  });

beforeEach(async () => {
  ({ db, repos } = createTestRepositories());
  store = createExpenseStore(repos);
  trip = await newTrip('오사카 여행');
  me = (await repos.companions.listByTrip(trip.id))[0]!;
});

afterEach(() => db.delete());

const expense = (overrides: Partial<NewExpense> = {}): NewExpense => ({
  tripId: trip.id,
  date: '2026-11-10',
  amount: 9_000,
  currency: 'KRW',
  exchangeRate: { rate: '1', source: 'same', fetchedAt: null },
  category: 'food',
  paymentMethod: 'card',
  payerId: me.id,
  splitMethod: 'equal',
  participants: [{ companionId: me.id, value: null }],
  memo: '',
  scheduleItemId: null,
  ...overrides,
});

const shareAmounts = () =>
  store.getState().expenses.map((e) => e.shares.map((s) => s.amount));

describe('expenseStore', () => {
  it('loads the companions, expenses and settlements of one trip', async () => {
    await repos.expenses.create(expense());
    await store.getState().load(trip.id);

    expect(store.getState()).toMatchObject({ tripId: trip.id, status: 'ready', settlements: [] });
    expect(store.getState().companions.map((c) => c.name)).toEqual(['나']);
    expect(store.getState().expenses).toHaveLength(1);
  });

  it('adds and renames companions in place', async () => {
    await store.getState().load(trip.id);
    const chulsoo = await store.getState().addCompanion({ tripId: trip.id, name: '철수' });
    await store.getState().renameCompanion(me.id, '시영');

    expect(store.getState().companions.map((c) => [c.id, c.name])).toEqual([
      [me.id, '시영'],
      [chulsoo.id, '철수'],
    ]);
  });

  it('re-reads expenses after a write: sorted by date, re-split after removing someone', async () => {
    await store.getState().load(trip.id);
    const chulsoo = await store.getState().addCompanion({ tripId: trip.id, name: '철수' });
    const everyone = [me, chulsoo].map((c) => ({ companionId: c.id, value: null }));

    const later = await store.getState().addExpense(expense({ date: '2026-11-11', participants: everyone }));
    await store.getState().addExpense(expense({ date: '2026-11-10' }));
    expect(store.getState().expenses.map((e) => e.date)).toEqual(['2026-11-10', '2026-11-11']);
    expect(shareAmounts()).toEqual([[9_000], [4_500, 4_500]]);

    await store.getState().removeCompanion(chulsoo.id);
    expect(store.getState().companions).toHaveLength(1);
    expect(shareAmounts()).toEqual([[9_000], [9_000]]);

    await store.getState().updateExpense(later.id, { ...expense(), amount: 1_000, date: '2026-11-09' });
    expect(store.getState().expenses.map((e) => e.amount)).toEqual([1_000, 9_000]);

    await store.getState().removeExpense(later.id);
    expect(store.getState().expenses.map((e) => e.amount)).toEqual([9_000]);
  });

  it('passes blocking errors through and keeps the data', async () => {
    await store.getState().load(trip.id);
    const chulsoo = await store.getState().addCompanion({ tripId: trip.id, name: '철수' });
    await store.getState().addExpense(expense({ payerId: chulsoo.id }));

    expect((await store.getState().companionUsage(chulsoo.id)).blockingExpenseIds).toHaveLength(1);
    await expect(store.getState().removeCompanion(chulsoo.id)).rejects.toBeInstanceOf(
      CompanionInUseError,
    );
    expect(store.getState().companions).toHaveLength(2);
  });

  it('records transfers as done and unchecks them, in place', async () => {
    await store.getState().load(trip.id);
    const chulsoo = await store.getState().addCompanion({ tripId: trip.id, name: '철수' });

    const first = await store.getState().addSettlement({
      tripId: trip.id,
      fromId: chulsoo.id,
      toId: me.id,
      amount: 4_500,
    });
    const second = await store.getState().addSettlement({
      tripId: trip.id,
      fromId: me.id,
      toId: chulsoo.id,
      amount: 1_000,
    });
    expect(store.getState().settlements.map((s) => s.id)).toEqual([first.id, second.id]);
    expect(first).toMatchObject({ amount: 4_500, currency: 'KRW' });

    await store.getState().removeSettlement(first.id);
    expect(store.getState().settlements.map((s) => s.id)).toEqual([second.id]);
    expect(await repos.settlements.listByTrip(trip.id)).toEqual([second]);
  });

  it('drops a late response for a trip it has moved away from', async () => {
    const other = await newTrip('도쿄 여행');
    const first = store.getState().load(trip.id);
    const second = store.getState().load(other.id);
    await Promise.all([first, second]);

    expect(store.getState().tripId).toBe(other.id);
    expect(store.getState().companions.every((c) => c.tripId === other.id)).toBe(true);
  });
});
