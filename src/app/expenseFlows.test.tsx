/** @vitest-environment happy-dom */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { repositories } from '@/data';
import type { Companion, Trip } from '@/data/models';
import type { NewExpense } from '@/data/repositories';
import { renderApp, resetApp, resetStores } from '@/test/app';

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
    city: { name: '오사카', placeId: null, location: null },
    startDate: '2026-11-10',
    endDate: '2026-11-12',
  });
  me = (await repositories.companions.listByTrip(trip.id))[0]!;
});

const addCompanion = (name: string) => repositories.companions.create({ tripId: trip.id, name });

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
/** Sets a native date input (user-event can't type into them). */
const setDate = (date: string) =>
  fireEvent.change(screen.getByLabelText('날짜'), { target: { value: date } });

describe('expense flows', () => {
  it('adds companions, then records an expense split among everyone', async () => {
    const { router, user } = renderApp(`/trips/${trip.id}?day=2026-11-10`);

    // The ledger tab keeps the selected day in the URL.
    await user.click(await screen.findByRole('link', { name: '가계부' }));
    expect(router.state.location.search).toBe('?day=2026-11-10&tab=expenses');
    expect(screen.getByRole('link', { name: '가계부' })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByText('아직 지출이 없어요')).toBeInTheDocument();
    expect(overview()).toHaveTextContent('0원');

    // Companions
    await user.click(screen.getByRole('button', { name: '동행자 관리' }));
    const sheet = await screen.findByRole('dialog', { name: '동행자' });
    for (const name of ['철수', '영희']) {
      await user.type(within(sheet).getByLabelText('새 동행자'), name);
      await user.click(within(sheet).getByRole('button', { name: '추가' }));
      expect(await within(sheet).findByText(name)).toBeInTheDocument();
    }
    await user.type(within(sheet).getByLabelText('새 동행자'), ' 철수 ');
    await user.click(within(sheet).getByRole('button', { name: '추가' }));
    expect(within(sheet).getByText('이미 있는 이름이에요.')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: '완료' }));
    expect(overview()).toHaveTextContent('3명 · 나, 철수, 영희');

    // Errors show on submit, focusing the first one.
    await user.click(screen.getByRole('link', { name: '지출 추가' }));
    expect(await screen.findByRole('heading', { name: '지출 추가' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(screen.getByText('금액을 입력해 주세요.')).toBeInTheDocument();
    expect(screen.getByText('카테고리를 골라 주세요.')).toBeInTheDocument();
    expect(screen.getByLabelText('금액')).toHaveFocus();

    await user.type(screen.getByLabelText('금액'), '10000');
    expect(screen.getByText('10,000원')).toBeInTheDocument(); // read back under the input
    await user.click(screen.getByRole('radio', { name: '식비' }));
    setDate('2026-11-11');
    await user.type(screen.getByLabelText('메모'), '타코야키');
    // Equal split, the 1-won remainder on the payer
    expect(screen.getByText('3,334원')).toBeInTheDocument();
    expect(screen.getAllByText('3,333원')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: '저장' }));

    // Back on the ledger, under its day
    expect(await screen.findByRole('link', { name: /타코야키/ })).toHaveTextContent(
      '타코야키나 결제 · 3명 균등 · 카드10,000원',
    );
    // (The memory router has no browser history, so "back" takes the fallback here.)
    expect(router.state.location.search).toContain('tab=expenses');
    expect(section('Day 2')).toHaveTextContent('Day 2 11.11 (수)합계 10,000원');
    expect(overview()).toHaveTextContent('총 지출10,000원');

    const [saved] = await repositories.expenses.listByTrip(trip.id);
    expect(saved!.shares.map((s) => s.amount)).toEqual([3_334, 3_333, 3_333]);
  });

  it('only saves amount splits that add up to the total', async () => {
    const chulsoo = await addCompanion('철수');
    const created = await repositories.expenses.create(
      expense({
        memo: '오코노미야키',
        participants: [me, chulsoo].map((c) => ({ companionId: c.id, value: null })),
      }),
    );
    const { user } = renderApp(`/trips/${trip.id}?tab=expenses`);

    await user.click(await screen.findByRole('link', { name: /오코노미야키/ }));
    expect(await screen.findByRole('heading', { name: '지출 수정' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '금액 지정' }));
    // Starts from the equal split, so it already adds up.
    expect(screen.getByLabelText('나 금액')).toHaveValue('5000');
    expect(screen.getByText('총액과 같아요')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('나 금액'));
    await user.type(screen.getByLabelText('나 금액'), '7000');
    expect(screen.getByText('2,000원 초과')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(screen.getByText('나눈 금액의 합이 총액보다 2,000원 많아요.')).toBeInTheDocument();
    expect(screen.getByLabelText('나 금액')).toHaveFocus();

    await user.clear(screen.getByLabelText('철수 금액'));
    await user.type(screen.getByLabelText('철수 금액'), '3000');
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByRole('link', { name: /오코노미야키/ })).toHaveTextContent(
      '2명 금액 지정',
    );

    const [saved] = await repositories.expenses.listByTrip(trip.id);
    expect(saved).toMatchObject({ id: created.id, splitMethod: 'amount' });
    expect(saved!.shares.map((s) => s.amount)).toEqual([7_000, 3_000]);
  });

  it('converts other currencies with the entered rate, then offers it again', async () => {
    const { user } = renderApp(`/trips/${trip.id}/expenses/new`);

    await user.selectOptions(await screen.findByLabelText('통화'), 'JPY · 엔');
    await user.type(screen.getByLabelText('금액'), '1200');
    await user.click(screen.getByRole('radio', { name: '교통' }));
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(screen.getByText('환율을 입력해 주세요.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('환율 (1 JPY당 원)'), '9.0412');
    expect(screen.getByText('≈ 10,849원')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(async () => expect(await repositories.expenses.listByTrip(trip.id)).toHaveLength(1));

    // The next expense starts in yen at the same rate.
    cleanup();
    resetStores();
    renderApp(`/trips/${trip.id}/expenses/new`);
    expect(await screen.findByLabelText('통화')).toHaveValue('JPY');
    expect(screen.getByLabelText('환율 (1 JPY당 원)')).toHaveValue('9.0412');
    expect(screen.getByText('마지막으로 쓴 환율')).toBeInTheDocument();

    const [saved] = await repositories.expenses.listByTrip(trip.id);
    expect(saved).toMatchObject({
      amount: 1_200,
      currency: 'JPY',
      exchangeRate: { rate: '9.0412', quote: 'KRW', source: 'manual' },
    });
  });

  it('lists foreign expenses with the converted amount, and links schedule items', async () => {
    const castle = await repositories.schedule.create({
      tripId: trip.id,
      date: '2026-11-10',
      place: { placeId: null, name: '오사카성', address: null, location: null },
    });
    await repositories.expenses.create(
      expense({
        amount: 600,
        currency: 'JPY',
        category: 'sightseeing',
        exchangeRate: { rate: '9', source: 'manual', fetchedAt: null },
        scheduleItemId: castle.id,
        date: '2026-11-01',
      }),
    );
    const { user } = renderApp(`/trips/${trip.id}?tab=expenses`);

    const row = await screen.findByRole('link', { name: /관광/ });
    expect(row).toHaveTextContent('관광11.1 (일) · 나 결제 · 개인 지출 · 카드오사카성¥600≈ 5,400원');
    expect(section('여행 전')).toContainElement(row);

    await user.click(row);
    const link = await screen.findByLabelText('일정 연결');
    expect(link).toHaveValue(castle.id);
    await user.selectOptions(link, '연결 안 함');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(screen.getByRole('link', { name: /관광/ })).not.toHaveTextContent('오사카성'));
  });

  it('deletes an expense after confirming', async () => {
    await repositories.expenses.create(expense({ memo: '편의점' }));
    const { user } = renderApp(`/trips/${trip.id}?tab=expenses`);

    await user.click(await screen.findByRole('link', { name: /편의점/ }));
    await user.click(await screen.findByRole('button', { name: '지출 삭제' }));
    await user.click(screen.getByRole('button', { name: '삭제' }));

    expect(await screen.findByText('아직 지출이 없어요')).toBeInTheDocument();
    expect(await repositories.expenses.listByTrip(trip.id)).toEqual([]);
  });

  it('keeps people who paid, and re-splits when removing someone who only shared', async () => {
    const chulsoo = await addCompanion('철수');
    const younghee = await addCompanion('영희');
    await repositories.expenses.create(
      expense({
        memo: '택시',
        payerId: chulsoo.id,
        participants: [{ companionId: chulsoo.id, value: null }],
      }),
    );
    await repositories.expenses.create(
      expense({
        memo: '저녁',
        amount: 9_000,
        participants: [me, younghee].map((c) => ({ companionId: c.id, value: null })),
      }),
    );
    const { router, user } = renderApp(`/trips/${trip.id}?tab=expenses`);

    await user.click(await screen.findByRole('button', { name: '동행자 관리' }));
    expect(screen.queryByRole('button', { name: '나 삭제' })).not.toBeInTheDocument();

    // Paid for something: can't go, and the sheet says where.
    await user.click(screen.getByRole('button', { name: '철수 삭제' }));
    const blocked = await screen.findByRole('dialog', { name: '철수를 삭제할 수 없어요' });
    await user.click(within(blocked).getByRole('button', { name: /택시/ }));
    expect(await screen.findByRole('heading', { name: '지출 수정' })).toBeInTheDocument();
    expect(router.state.location.pathname).toMatch(/\/expenses\/[0-9a-f-]{36}$/);

    // Only shared: confirm, then the rest share it.
    await user.click(screen.getByRole('button', { name: '뒤로' }));
    await user.click(await screen.findByRole('button', { name: '동행자 관리' }));
    await user.click(screen.getByRole('button', { name: '영희 삭제' }));
    expect(await screen.findByText('영희가 함께 나눈 지출 1건은 남은 사람끼리 다시 나눠요.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '빼고 다시 나누기' }));

    await waitFor(() => expect(overview()).toHaveTextContent('2명 · 나, 철수'));
    const dinner = (await repositories.expenses.listByTrip(trip.id)).find((e) => e.memo === '저녁');
    expect(dinner!.shares.map((s) => [s.companionId, s.amount])).toEqual([[me.id, 9_000]]);
  });

  it('renames companions, including "나"', async () => {
    const { user } = renderApp(`/trips/${trip.id}?tab=expenses`);

    await user.click(await screen.findByRole('button', { name: '동행자 관리' }));
    await user.click(screen.getByRole('button', { name: '나 이름 바꾸기' }));
    const name = within(await screen.findByRole('dialog', { name: '이름 바꾸기' })).getByLabelText('이름');
    await user.clear(name);
    await user.type(name, '시영');
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(overview()).toHaveTextContent('1명 · 시영'));
    expect((await repositories.companions.listByTrip(trip.id))[0]).toMatchObject({ name: '시영', isMe: true });
  });

  it('changes the settlement currency until something is recorded', async () => {
    const { user } = renderApp(`/trips/${trip.id}?tab=expenses`);

    await user.click(await screen.findByRole('button', { name: '정산 통화 KRW 기준' }));
    await user.selectOptions(screen.getByRole('combobox', { name: '정산 통화' }), 'JPY · 엔');
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByRole('button', { name: '정산 통화 JPY 기준' })).toBeInTheDocument();
    expect(overview()).toHaveTextContent('¥0');

    await repositories.expenses.create(expense({ currency: 'JPY' }));
    cleanup();
    resetStores();
    const next = renderApp(`/trips/${trip.id}?tab=expenses`);
    await next.user.click(await screen.findByRole('button', { name: '정산 통화 JPY 기준' }));
    expect(screen.getByRole('combobox', { name: '정산 통화' })).toBeDisabled();
    expect(screen.getByText('지출이나 송금 기록이 있어서 바꿀 수 없어요.')).toBeInTheDocument();
  });

  it('mentions expenses when deleting the trip', async () => {
    await repositories.expenses.create(expense({}));
    const { user } = renderApp(`/trips/${trip.id}`);

    await user.click(await screen.findByRole('button', { name: '여행 메뉴' }));
    await user.click(screen.getByRole('button', { name: '여행 삭제' }));
    expect(
      await screen.findByText('이 여행의 지출 1건도 함께 삭제되고, 되돌릴 수 없어요.'),
    ).toBeInTheDocument();
  });
});
