import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TravelGoDB } from '@/data/local';
import type { Companion, Trip } from '@/data/models';
import {
  CompanionInUseError,
  type NewExpense,
  type Repositories,
  ValidationError,
} from '@/data/repositories';
import { meCompanionId } from '@/data/rules/companion';
import { createTestRepositories } from '@/test/fixtures';

let db: TravelGoDB;
let repos: Repositories;
let trip: Trip;
let me: Companion;

beforeEach(async () => {
  ({ db, repos } = createTestRepositories());
  trip = await repos.trips.create({
    title: '오사카 여행',
    city: { name: '오사카', placeId: null, location: null },
    startDate: '2026-11-10',
    endDate: '2026-11-12',
  });
  me = (await repos.companions.listByTrip(trip.id))[0]!;
});

afterEach(() => db.delete());

const add = (name: string) => repos.companions.create({ tripId: trip.id, name });

const expense = (overrides: Partial<NewExpense>): NewExpense => ({
  tripId: trip.id,
  date: '2026-11-10',
  amount: 30_000,
  currency: 'KRW',
  exchangeRate: { rate: '1', source: 'same', fetchedAt: null },
  category: 'food',
  paymentMethod: 'card',
  payerId: me.id,
  splitMethod: 'equal',
  participants: [],
  memo: '',
  scheduleItemId: null,
  ...overrides,
});
const everyone = (...people: Companion[]) =>
  people.map((person) => ({ companionId: person.id, value: null }));

describe('LocalCompanionRepository', () => {
  it('starts every trip with "나", then adds people in order', async () => {
    expect(me).toMatchObject({ id: meCompanionId(trip.id), name: '나', isMe: true, order: 0 });

    await add('  철수 ');
    await add('영희');

    expect((await repos.companions.listByTrip(trip.id)).map((c) => [c.name, c.order])).toEqual([
      ['나', 0],
      ['철수', 1],
      ['영희', 2],
    ]);
  });

  it('keeps names unique within the trip', async () => {
    const chulsoo = await add('철수');
    await expect(add(' 철수')).rejects.toBeInstanceOf(ValidationError);
    await expect(add('나')).rejects.toBeInstanceOf(ValidationError);
    await expect(add('  ')).rejects.toBeInstanceOf(ValidationError);
    await expect(repos.companions.rename(chulsoo.id, '나')).rejects.toBeInstanceOf(ValidationError);

    expect((await repos.companions.rename(me.id, '시영')).name).toBe('시영');
    expect((await repos.companions.rename(chulsoo.id, '철수')).name).toBe('철수');
  });

  it('never deletes "나"', async () => {
    await expect(repos.companions.delete(me.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it('deletes someone with no expenses', async () => {
    const chulsoo = await add('철수');
    await repos.companions.delete(chulsoo.id);
    expect(await repos.companions.listByTrip(trip.id)).toEqual([me]);
  });

  it('refuses while they paid, are in an amount split or a settlement, and says where', async () => {
    const chulsoo = await add('철수');
    const younghee = await add('영희');
    const paid = await repos.expenses.create(
      expense({ payerId: chulsoo.id, participants: everyone(me, chulsoo) }),
    );
    const byAmount = await repos.expenses.create(
      expense({
        amount: 10_000,
        splitMethod: 'amount',
        participants: [
          { companionId: me.id, value: 4_000 },
          { companionId: younghee.id, value: 6_000 },
        ],
      }),
    );
    const settlement = await repos.settlements.create({
      tripId: trip.id,
      fromId: chulsoo.id,
      toId: me.id,
      amount: 5_000,
    });

    expect(await repos.companions.usage(chulsoo.id)).toEqual({
      blockingExpenseIds: [paid.id],
      settlementIds: [settlement.id],
      resplitExpenseIds: [],
    });
    const error = await repos.companions.delete(younghee.id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CompanionInUseError);
    expect((error as CompanionInUseError).usage.blockingExpenseIds).toEqual([byAmount.id]);
    expect(await repos.companions.listByTrip(trip.id)).toHaveLength(3);
  });

  it('refuses when nobody would be left to share an expense', async () => {
    const chulsoo = await add('철수');
    const treat = await repos.expenses.create(expense({ participants: everyone(chulsoo) }));

    expect((await repos.companions.usage(chulsoo.id)).blockingExpenseIds).toEqual([treat.id]);
  });

  it('takes them out of equal splits and re-splits among the rest', async () => {
    const chulsoo = await add('철수');
    const younghee = await add('영희');
    const dinner = await repos.expenses.create(
      expense({ amount: 10_000, participants: everyone(me, chulsoo, younghee) }),
    );

    expect((await repos.companions.usage(younghee.id)).resplitExpenseIds).toEqual([dinner.id]);
    await repos.companions.delete(younghee.id);

    const [after] = await repos.expenses.listByTrip(trip.id);
    expect(after!.shares.map((s) => [s.companionId, s.amount])).toEqual([
      [me.id, 5_000],
      [chulsoo.id, 5_000],
    ]);
    expect(after!.updatedAt > dinner.updatedAt).toBe(true);
  });
});
