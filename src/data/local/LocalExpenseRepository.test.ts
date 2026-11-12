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
    cities: [{ name: '오사카', placeId: null, location: null, fetchedAt: null }],
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
  payerIds: [me.id],
  splitMethod: 'equal',
  participants: [
    { companionId: me.id, value: null },
    { companionId: friend.id, value: null },
  ],
  title: '',
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

  it('stores several payers as given', async () => {
    const created = await repos.expenses.create(input({ payerIds: [friend.id, me.id] }));
    expect(created.payerIds).toEqual([friend.id, me.id]);
    expect((await repos.expenses.listByTrip(trip.id))[0]!.payerIds).toEqual([friend.id, me.id]);
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

    for (const payerIds of [['stranger'], [], [me.id, me.id]]) {
      await expect(repos.expenses.create(input({ payerIds }))).rejects.toBeInstanceOf(ValidationError);
    }
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
      input({ amount: 9_000, payerIds: [friend.id], participants: [{ companionId: friend.id, value: null }] }),
    );
    expect(updated.shares.map((s) => [s.companionId, s.amount])).toEqual([[friend.id, 9_000]]);
    expect(await db.expenseShares.where('expenseId').equals(later.id).count()).toBe(1);

    await repos.expenses.delete(later.id);
    expect(await db.expenseShares.where('expenseId').equals(later.id).count()).toBe(0);
    expect((await repos.expenses.listByTrip(trip.id)).map((e) => e.id)).toEqual([flight.id]);
  });

  it('remembers the latest rate per currency and quote, across trips', async () => {
    const other = await repos.trips.create({
      title: '도쿄 여행',
      cities: [{ name: '도쿄', placeId: null, location: null, fetchedAt: null }],
      startDate: '2026-12-01',
      endDate: '2026-12-03',
    });
    const otherMe = (await repos.companions.listByTrip(other.id))[0]!;
    const yen = (tripId: string, payerId: string, rate: string) =>
      input({
        tripId,
        payerIds: [payerId],
        participants: [{ companionId: payerId, value: null }],
        currency: 'JPY',
        exchangeRate: { rate, source: 'manual', fetchedAt: null },
      });

    await repos.expenses.create(yen(trip.id, me.id, '9.5'));
    const latestYen = await repos.expenses.create(yen(other.id, otherMe.id, '9.1'));
    await repos.expenses.create(input({ amount: 1_000 })); // in the settlement currency: no rate
    const dollar = await repos.expenses.create(
      input({
        currency: 'USD',
        exchangeRate: { rate: '1380.5', source: 'api', fetchedAt: '2026-11-02T00:00:00.000Z' },
      }),
    );
    // A trip settled in yen quotes won in yen.
    const yenTrip = await repos.trips.create({
      title: '삿포로 여행',
      cities: [{ name: '삿포로', placeId: null, location: null, fetchedAt: null }],
      startDate: '2027-02-01',
      endDate: '2027-02-03',
    });
    await repos.trips.update(yenTrip.id, { settlementCurrency: 'JPY' });
    const yenTripMe = (await repos.companions.listByTrip(yenTrip.id))[0]!;
    const won = await repos.expenses.create(
      input({
        tripId: yenTrip.id,
        payerIds: [yenTripMe.id],
        participants: [{ companionId: yenTripMe.id, value: null }],
        exchangeRate: { rate: '0.11', source: 'manual', fetchedAt: null },
      }),
    );

    const used = await repos.expenses.usedRates();
    const byPair = Object.fromEntries(
      used.map((u) => [`${u.currency}/${u.exchangeRate.quote}`, [u.exchangeRate.rate, u.createdAt]]),
    );
    expect(byPair).toEqual({
      'JPY/KRW': ['9.1', latestYen.createdAt],
      'USD/KRW': ['1380.5', dollar.createdAt],
      'KRW/JPY': ['0.11', won.createdAt],
    });
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

  it('keeps the expenses of several schedule items deleted at once, unlinked', async () => {
    const place = (name: string) =>
      repos.schedule.create({ tripId: trip.id, date: null, place: makePlace(name) });
    const [usj, castle, kept] = [await place('USJ'), await place('오사카성'), await place('도톤보리')];
    for (const item of [usj, castle, kept]) await repos.expenses.create(input({ scheduleItemId: item.id }));

    await repos.schedule.deleteMany([usj.id, castle.id]);

    const links = (await repos.expenses.listByTrip(trip.id)).map((e) => e.scheduleItemId);
    expect(links.sort()).toEqual([kept.id, null, null].sort());
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

  it('drops the budget with the settlement currency it was in, unless a new one is given', async () => {
    await repos.trips.update(trip.id, { budget: 500_000 });
    expect(await repos.trips.update(trip.id, { settlementCurrency: 'USD' })).toMatchObject({
      settlementCurrency: 'USD',
      budget: null,
    });
    expect(
      await repos.trips.update(trip.id, { settlementCurrency: 'JPY', budget: 50_000 }),
    ).toMatchObject({ settlementCurrency: 'JPY', budget: 50_000 });
    expect((await repos.trips.update(trip.id, { title: '간사이 여행' })).budget).toBe(50_000);
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
