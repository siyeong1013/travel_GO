import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TravelGoDB } from '@/data/local';
import type { Companion, Trip } from '@/data/models';
import {
  CurrencyLockedError,
  InvalidSplitError,
  type NewExpense,
  type Repositories,
  ValidationError,
} from '@/data/repositories';
import { createTestRepositories, makePlace } from '@/test/fixtures';

let db: TravelGoDB;
let repos: Repositories;
let trip: Trip;
let me: Companion;
let friend: Companion;

beforeEach(async () => {
  ({ db, repos } = createTestRepositories());
  trip = await repos.trips.create({
    title: '오사카 여행',
    city: { name: '오사카', placeId: null, location: null },
    startDate: '2026-11-10',
    endDate: '2026-11-12',
  });
  me = (await repos.companions.listByTrip(trip.id))[0]!;
  friend = await repos.companions.create({ tripId: trip.id, name: '철수' });
});

afterEach(() => db.delete());

const input = (overrides: Partial<NewExpense> = {}): NewExpense => ({
  tripId: trip.id,
  date: '2026-11-10',
  amount: 30_000,
  currency: 'KRW',
  exchangeRate: { rate: '1', source: 'same', fetchedAt: null },
  category: 'food',
  paymentMethod: 'card',
  payerId: me.id,
  splitMethod: 'equal',
  participants: [
    { companionId: me.id, value: null },
    { companionId: friend.id, value: null },
  ],
  memo: '',
  scheduleItemId: null,
  ...overrides,
});

describe('LocalExpenseRepository', () => {
  it('stores the expense with computed shares; same-currency rate is "1"', async () => {
    const created = await repos.expenses.create(
      input({ amount: 10_001, exchangeRate: { rate: '9', source: 'manual', fetchedAt: null } }),
    );

    expect(created.exchangeRate).toEqual({ rate: '1', quote: 'KRW', source: 'same', fetchedAt: null });
    expect(created.shares.map((s) => [s.companionId, s.weight, s.amount])).toEqual([
      [me.id, 1, 5_001],
      [friend.id, 1, 5_000],
    ]);
    expect(await repos.expenses.listByTrip(trip.id)).toEqual([created]);
  });

  it('keeps the rate snapshot for foreign currencies, quoted in the settlement currency', async () => {
    const created = await repos.expenses.create(
      input({
        amount: 1_200,
        currency: 'JPY',
        exchangeRate: { rate: '9.0412', source: 'api', fetchedAt: '2026-11-02T00:00:00.000Z' },
      }),
    );
    expect(created.exchangeRate).toEqual({
      rate: '9.0412',
      quote: 'KRW',
      source: 'api',
      fetchedAt: '2026-11-02T00:00:00.000Z',
    });
  });

  it('refuses amounts that do not add up, and people from elsewhere', async () => {
    const error = await repos.expenses
      .create(
        input({
          splitMethod: 'amount',
          participants: [
            { companionId: me.id, value: 20_000 },
            { companionId: friend.id, value: 5_000 },
          ],
        }),
      )
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidSplitError);
    expect((error as InvalidSplitError).detail).toEqual({ kind: 'sum_mismatch', difference: 5_000 });

    await expect(repos.expenses.create(input({ payerId: 'stranger' }))).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(repos.expenses.create(input({ amount: 12.5 }))).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(repos.expenses.create(input({ currency: 'XYZ' }))).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(await repos.expenses.listByTrip(trip.id)).toEqual([]);
  });

  it('lists by date, replaces shares on update, and deletes with the shares', async () => {
    const later = await repos.expenses.create(input({ date: '2026-11-11' }));
    const flight = await repos.expenses.create(input({ date: '2026-10-01', category: 'transport' }));
    expect((await repos.expenses.listByTrip(trip.id)).map((e) => e.id)).toEqual([flight.id, later.id]);

    const updated = await repos.expenses.update(
      later.id,
      input({ amount: 9_000, payerId: friend.id, participants: [{ companionId: friend.id, value: null }] }),
    );
    expect(updated.shares.map((s) => [s.companionId, s.amount])).toEqual([[friend.id, 9_000]]);
    expect(await db.expenseShares.where('expenseId').equals(later.id).count()).toBe(1);

    await repos.expenses.delete(later.id);
    expect(await db.expenseShares.where('expenseId').equals(later.id).count()).toBe(0);
    expect((await repos.expenses.listByTrip(trip.id)).map((e) => e.id)).toEqual([flight.id]);
  });

  it('keeps the expense but drops the link when its schedule item is deleted', async () => {
    const item = await repos.schedule.create({ tripId: trip.id, date: null, place: makePlace('USJ') });
    const ticket = await repos.expenses.create(input({ scheduleItemId: item.id }));
    await expect(
      repos.expenses.create(input({ scheduleItemId: 'nope' })),
    ).rejects.toBeInstanceOf(ValidationError);

    await repos.schedule.delete(item.id);

    const [after] = await repos.expenses.listByTrip(trip.id);
    expect(after).toMatchObject({ id: ticket.id, scheduleItemId: null });
  });
});

describe('trip settings and cleanup', () => {
  it('sets the budget, and locks the settlement currency once there are expenses', async () => {
    expect(trip).toMatchObject({ settlementCurrency: 'KRW', budget: null });
    expect(await repos.trips.update(trip.id, { settlementCurrency: 'JPY', budget: 100_000 })).toMatchObject(
      { settlementCurrency: 'JPY', budget: 100_000 },
    );
    await expect(repos.trips.update(trip.id, { budget: -1 })).rejects.toBeInstanceOf(ValidationError);

    await repos.expenses.create(input({ currency: 'JPY' }));
    await expect(
      repos.trips.update(trip.id, { settlementCurrency: 'KRW' }),
    ).rejects.toBeInstanceOf(CurrencyLockedError);
    expect((await repos.trips.update(trip.id, { budget: null })).settlementCurrency).toBe('JPY');
  });

  it('records settlements in the settlement currency', async () => {
    const settlement = await repos.settlements.create({
      tripId: trip.id,
      fromId: friend.id,
      toId: me.id,
      amount: 15_000,
    });
    expect(settlement).toMatchObject({ amount: 15_000, currency: 'KRW' });
    await expect(
      repos.settlements.create({ tripId: trip.id, fromId: me.id, toId: me.id, amount: 1 }),
    ).rejects.toBeInstanceOf(ValidationError);

    await repos.settlements.delete(settlement.id);
    expect(await repos.settlements.listByTrip(trip.id)).toEqual([]);
  });

  it('deletes everything of a trip with it', async () => {
    await repos.expenses.create(input());
    await repos.settlements.create({ tripId: trip.id, fromId: friend.id, toId: me.id, amount: 1 });

    await repos.trips.delete(trip.id);

    for (const table of [db.companions, db.expenses, db.expenseShares, db.settlements]) {
      expect(await table.count(), table.name).toBe(0);
    }
  });
});
