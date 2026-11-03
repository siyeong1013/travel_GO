/** @vitest-environment happy-dom */
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { repositories } from '@/data';
import type { Companion, Trip } from '@/data/models';
import type { NewExpense } from '@/data/repositories';
import { createBackupFile } from '@/data/rules/backupFormat';
import { renderApp, resetApp, resetStores, stubRatesApi } from '@/test/app';
import {
  backupData,
  latestRatesBody,
  makeExpense,
  makeTrip,
  RATES_PUBLISHED_AT,
  T0,
} from '@/test/fixtures';

vi.mock('@/data', async () => {
  const { createTestRepositories } = await import('@/test/fixtures');
  return { repositories: createTestRepositories().repos };
});

let trip: Trip;
let me: Companion;

beforeEach(async () => {
  await resetApp();
  trip = await repositories.trips.create({
    title: '오사카 여행',
    city: { name: '오사카', placeId: null, location: null, fetchedAt: null },
    startDate: '2026-11-10',
    endDate: '2026-11-12',
  });
  me = (await repositories.companions.listByTrip(trip.id))[0]!;
});

const expense = (overrides: Partial<NewExpense>): NewExpense => ({
  tripId: trip.id,
  date: '2026-11-10',
  amount: 10_000,
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

const overview = () => screen.getByRole('region', { name: '가계부 요약' });
const section = (title: string) => screen.getByRole('region', { name: title });
const rows = (title: string) =>
  within(section(title))
    .getAllByRole('listitem')
    .map((item) => item.textContent);

describe('budget and summary', () => {
  it('sets a budget, shows what is left or over, and removes it', async () => {
    await repositories.expenses.create(expense({ amount: 120_000 }));
    const { user } = renderApp(`/trips/${trip.id}?tab=expenses`);

    await user.click(await screen.findByRole('button', { name: '예산 정하기' }));
    const sheet = await screen.findByRole('dialog', { name: '예산' });
    const field = within(sheet).getByLabelText('여행 예산 (원)');
    await user.type(field, '50만');
    await user.click(within(sheet).getByRole('button', { name: '저장' }));
    expect(within(sheet).getByText(/금액을 숫자로 입력해 주세요/)).toBeInTheDocument();
    expect(field).toHaveFocus();

    await user.clear(field);
    await user.type(field, '500,000');
    expect(within(sheet).getByText('500,000원')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: '저장' }));
    await waitFor(() => expect(overview()).toHaveTextContent('380,000원 남음'));
    expect(overview()).toHaveTextContent('예산 500,000원 · 24% 사용');
    expect((await repositories.trips.get(trip.id))?.budget).toBe(500_000);

    // Over budget
    await repositories.expenses.create(expense({ amount: 400_000 }));
    cleanup();
    resetStores();
    const next = renderApp(`/trips/${trip.id}?tab=expenses`);
    expect(await screen.findByText('20,000원 초과')).toBeInTheDocument();
    expect(overview()).toHaveTextContent('예산 500,000원 · 104% 사용');

    // Emptied: no budget
    await next.user.click(screen.getByRole('button', { name: '예산 수정' }));
    const edit = await screen.findByRole('dialog', { name: '예산' });
    await next.user.clear(within(edit).getByLabelText('여행 예산 (원)'));
    await next.user.click(within(edit).getByRole('button', { name: '저장' }));
    expect(await screen.findByRole('button', { name: '예산 정하기' })).toBeInTheDocument();
    expect(overview()).not.toHaveTextContent('남음');
    expect((await repositories.trips.get(trip.id))?.budget).toBeNull();
  });

  it('warns that changing the settlement currency drops the budget', async () => {
    await repositories.trips.update(trip.id, { budget: 500_000 });
    const { user } = renderApp(`/trips/${trip.id}?tab=expenses`);

    await user.click(await screen.findByRole('button', { name: '정산 통화 KRW 기준' }));
    await user.selectOptions(screen.getByRole('combobox', { name: '정산 통화' }), 'JPY · 엔');
    expect(screen.getByRole('note')).toHaveTextContent('예산(500,000원)이 지워져요');
    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByRole('button', { name: '정산 통화 JPY 기준' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '예산 정하기' })).toBeInTheDocument();
    expect(await repositories.trips.get(trip.id)).toMatchObject({
      settlementCurrency: 'JPY',
      budget: null,
    });
  });

  it('sums up spending by category, by day and by person', async () => {
    const chulsoo = await repositories.companions.create({ tripId: trip.id, name: '철수' });
    const both = [me, chulsoo].map((c) => ({ companionId: c.id, value: null }));
    await repositories.trips.update(trip.id, { budget: 300_000 });
    await repositories.expenses.create(expense({ amount: 30_000, participants: both }));
    await repositories.expenses.create(
      expense({
        date: '2026-11-11',
        amount: 1_000,
        currency: 'JPY',
        exchangeRate: { rate: '9', source: 'manual', fetchedAt: null },
        category: 'transport',
        payerId: chulsoo.id,
        participants: both,
      }),
    );
    await repositories.expenses.create(
      expense({ date: '2026-10-01', amount: 200_000, category: 'lodging' }),
    );
    const { user } = renderApp(`/trips/${trip.id}?tab=expenses`);

    await user.click(await screen.findByRole('link', { name: '지출 요약' }));
    expect(await screen.findByRole('heading', { name: '지출 요약' })).toBeInTheDocument();

    expect(section('예산')).toHaveTextContent('총 지출239,000원');
    expect(section('예산')).toHaveTextContent('61,000원 남음');
    expect(rows('카테고리별')).toEqual([
      '숙소200,000원84%',
      '식비30,000원13%',
      '교통9,000원4%',
    ]);
    expect(rows('날짜별')).toEqual([
      '여행 전200,000원',
      'Day 1 11.10 (화)30,000원',
      'Day 2 11.11 (수)9,000원',
      'Day 3 11.12 (목)0원',
    ]);
    const people = within(section('동행자별')).getAllByRole('row').slice(1);
    expect(people.map((row) => row.textContent)).toEqual([
      '나230,000원219,500원',
      '철수9,000원19,500원',
    ]);

    // Back to the ledger tab
    await user.click(screen.getByRole('button', { name: '뒤로' }));
    expect(await screen.findByRole('region', { name: '가계부 요약' })).toBeInTheDocument();
  });

  it('lists expenses whose rate has to be entered again, prefilled with the latest one', async () => {
    stubRatesApi(() => latestRatesBody('JPY', { KRW: 8.510259 }));
    // A trip settled in won with a rate quoted in dollars (e.g. merged from another backup).
    const merged = makeTrip({ startDate: '2026-11-10', endDate: '2026-11-12' });
    const data = backupData({ trips: [merged] });
    const { shares, ...stray } = makeExpense(
      {
        tripId: merged.id,
        payerId: data.companions[0]!.id,
        amount: 500,
        currency: 'JPY',
        memo: '자판기',
        exchangeRate: { rate: '0.0067', quote: 'USD', source: 'manual', fetchedAt: null },
      },
      [{ companionId: data.companions[0]!.id, weight: 1, amount: 500 }],
    );
    await repositories.backup.importAll(
      createBackupFile({ ...data, expenses: [stray], expenseShares: shares }, T0),
      'overwrite',
    );
    const { user } = renderApp(`/trips/${merged.id}/expenses/summary`);

    const fix = await screen.findByRole('region', { name: '환율을 다시 입력해야 하는 지출' });
    expect(section('예산')).toHaveTextContent('총 지출0원');
    await user.click(within(fix).getByRole('link', { name: /자판기/ }));

    expect(await screen.findByRole('note')).toHaveTextContent('USD 기준이에요');
    await waitFor(() => expect(screen.getByLabelText('환율 (1 JPY당 원)')).toHaveValue('8.510259'));
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(async () =>
      expect((await repositories.expenses.listByTrip(merged.id))[0]?.exchangeRate).toEqual({
        rate: '8.510259',
        quote: 'KRW',
        source: 'api',
        fetchedAt: RATES_PUBLISHED_AT,
      }),
    );
  });
});
