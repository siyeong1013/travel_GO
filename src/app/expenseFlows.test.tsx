/** @vitest-environment happy-dom */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { repositories } from '@/data';
import type { Companion, Trip } from '@/data/models';
import type { NewExpense } from '@/data/repositories';
import { formatDateTime } from '@/lib/format';
import { renderApp, resetApp, resetStores, stubRatesApi } from '@/test/app';
import { latestRatesBody, namedPlace, RATES_PUBLISHED_AT } from '@/test/fixtures';

vi.mock('@/data', async () => (await import('@/test/fixtures')).createTestData());

let trip: Trip;
let me: Companion;

beforeEach(async () => {
  await resetApp();
  trip = await repositories.trips.create({
    title: '오사카 여행',
    cities: [{ name: '오사카', placeId: null, location: null, fetchedAt: null }],
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
    // The header comes first; the form once the ledger and the rates used before are read.
    await user.click(await screen.findByRole('button', { name: '저장' }));
    expect(screen.getByText('금액을 입력해 주세요.')).toBeInTheDocument();
    expect(screen.getByText('카테고리를 골라 주세요.')).toBeInTheDocument();
    expect(screen.getByLabelText('금액')).toHaveFocus();

    await user.type(screen.getByLabelText('금액'), '10000');
    expect(screen.getByText('10,000원')).toBeInTheDocument(); // read back under the input
    // In the settlement currency already: nothing to convert.
    expect(screen.queryByText(/^≈/)).toBeNull();
    await user.click(screen.getByRole('radio', { name: '식비' }));
    setDate('2026-11-11');
    await user.type(screen.getByLabelText('메모'), '타코야키');
    // Equal split, the 1-won remainder on the payer
    expect(screen.getByText('3,334원')).toBeInTheDocument();
    expect(screen.getAllByText('3,333원')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: '저장' }));

    // Back on the ledger, under its day
    // The memo is the title, so the category leads the line under it.
    expect(await screen.findByRole('link', { name: /타코야키/ })).toHaveTextContent(
      /^타코야키식비 · 나 결제 · 3명 균등 · 카드10,000원$/,
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
    await user.click(await screen.findByRole('radio', { name: '금액 지정' }));
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

  it('fills in the latest rate from the API, credits it, and keeps it on the device', async () => {
    const fetch = stubRatesApi(() => latestRatesBody('JPY', { KRW: 8.510259, USD: 0.006333 }));
    await repositories.expenses.create(
      expense({ currency: 'JPY', exchangeRate: { rate: '9', source: 'manual', fetchedAt: null } }),
    );
    const { user } = renderApp(`/trips/${trip.id}/expenses/new`);

    // Starts in yen (the last expense's currency); the API rate replaces the last one used.
    const rate = await screen.findByLabelText('환율 (1 JPY당 원)');
    await waitFor(() => expect(rate).toHaveValue('8.51'));
    expect(fetch).toHaveBeenCalledWith('https://open.er-api.com/v6/latest/JPY', expect.anything());
    expect(screen.getByText(`${formatDateTime(RATES_PUBLISHED_AT)} 기준`)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Rates By Exchange Rate API' })).toHaveAttribute(
      'href',
      'https://www.exchangerate-api.com',
    );

    await user.type(screen.getByLabelText('금액'), '1000');
    expect(screen.getByText('≈ 8,510원')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '교통' }));
    await user.click(screen.getByRole('button', { name: '저장' }));

    // The ledger credits the API for its converted amounts.
    expect(await screen.findByRole('link', { name: /교통/ })).toHaveTextContent('≈ 8,510원');
    expect(screen.getByRole('link', { name: 'Rates By Exchange Rate API' })).toBeInTheDocument();
    const saved = (await repositories.expenses.listByTrip(trip.id)).find((e) => e.category === 'transport');
    expect(saved?.exchangeRate).toEqual({
      rate: '8.51',
      quote: 'KRW',
      source: 'api',
      fetchedAt: RATES_PUBLISHED_AT,
    });

    // After a reload the rates come from the device, not another request.
    cleanup();
    resetStores();
    renderApp(`/trips/${trip.id}/expenses/new`);
    await waitFor(() => expect(screen.getByLabelText('환율 (1 JPY당 원)')).toHaveValue('8.51'));
    expect(fetch).toHaveBeenCalledTimes(1);

    // Offline with nothing kept: the rate last used, still saying when it was published.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    localStorage.clear();
    cleanup();
    resetStores();
    renderApp(`/trips/${trip.id}/expenses/new`);
    expect(await screen.findByLabelText('환율 (1 JPY당 원)')).toHaveValue('8.51');
    expect(await screen.findByText('최신 환율을 불러오지 못했어요')).toBeInTheDocument();
    expect(screen.getByText('마지막으로 쓴 환율')).toBeInTheDocument();
    expect(screen.getByText(`${formatDateTime(RATES_PUBLISHED_AT)} 기준`)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Rates By Exchange Rate API' })).toBeInTheDocument();
  });

  it('falls back to the rate last used on another trip when offline', async () => {
    const other = await repositories.trips.create({
      title: '하와이 여행',
      cities: [{ name: '호놀룰루', placeId: null, location: null, fetchedAt: null }],
      startDate: '2026-08-01',
      endDate: '2026-08-05',
    });
    const otherMe = (await repositories.companions.listByTrip(other.id))[0]!;
    await repositories.expenses.create(
      expense({
        tripId: other.id,
        payerId: otherMe.id,
        participants: [{ companionId: otherMe.id, value: null }],
        currency: 'USD',
        exchangeRate: { rate: '1380', source: 'manual', fetchedAt: null },
      }),
    );
    const { user } = renderApp(`/trips/${trip.id}/expenses/new`);

    await user.selectOptions(await screen.findByLabelText('통화'), 'USD · 미국 달러');
    expect(screen.getByLabelText('환율 (1 USD당 원)')).toHaveValue('1380');
    expect(await screen.findByText('최신 환율을 불러오지 못했어요')).toBeInTheDocument();
    expect(screen.getByText('마지막으로 쓴 환율')).toBeInTheDocument();

    // Nothing to fall back on: type it.
    await user.selectOptions(screen.getByLabelText('통화'), 'EUR · 유로');
    expect(
      await screen.findByText('최신 환율을 불러오지 못했어요. 직접 입력해 주세요.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('환율 (1 EUR당 원)')).toHaveValue('');
  });

  it('keeps a rate typed while the latest one loads, and replaces it on request', async () => {
    let arrive!: () => void;
    const arrived = new Promise<void>((resolve) => (arrive = resolve));
    const fetch = stubRatesApi(async () => {
      await arrived;
      return latestRatesBody('USD', { KRW: 1344.12576 });
    });
    const { user } = renderApp(`/trips/${trip.id}/expenses/new`);

    await user.selectOptions(await screen.findByLabelText('통화'), 'USD · 미국 달러');
    expect(screen.getByText('최신 환율 불러오는 중…')).toBeInTheDocument();
    const rate = screen.getByLabelText('환율 (1 USD당 원)');
    await user.type(rate, '1400');
    arrive();
    await waitFor(() => expect(screen.queryByText('최신 환율 불러오는 중…')).not.toBeInTheDocument());
    expect(rate).toHaveValue('1400');

    await user.click(screen.getByRole('button', { name: '최신 환율 불러오기' }));
    await waitFor(() => expect(rate).toHaveValue('1344.13'));
    expect(fetch).toHaveBeenCalledTimes(1); // still fresh: no second request
  });

  it('lists foreign expenses with the converted amount, and links schedule items', async () => {
    const castle = await repositories.schedule.create({
      tripId: trip.id,
      date: '2026-11-10',
      place: { placeId: null, name: '오사카성', address: null, location: null, fetchedAt: null },
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
    // No memo: the category is the title, and is not repeated under it.
    expect(row).toHaveTextContent(/^관광11\.1 \(일\) · 나 결제 · 개인 지출 · 카드오사카성¥600≈ 5,400원$/);
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

describe('expenses from the schedule', () => {
  const DAY2 = '2026-11-11';
  const findCard = (name: string) =>
    screen.findByRole('button', { name: new RegExp(`^${name}(?! 순서 바꾸기)`) });
  /** The "지출" part of the open place's sheet. */
  const spent = () =>
    within(screen.getByRole('dialog', { name: '일정 편집' })).getByRole('region', { name: '지출' });
  const addPlace = (name: string) =>
    repositories.schedule.create({ tripId: trip.id, date: DAY2, place: namedPlace(name) });

  it("shows what was spent at a place, and adds to it from the place's sheet", async () => {
    const castle = await addPlace('오사카성');
    await addPlace('도톤보리');
    await repositories.expenses.create(
      expense({
        date: DAY2,
        amount: 1_200,
        currency: 'JPY',
        exchangeRate: { rate: '9', source: 'manual', fetchedAt: null },
        category: 'sightseeing',
        memo: '천수각 입장권',
        scheduleItemId: castle.id,
      }),
    );
    await repositories.expenses.create(expense({ date: DAY2, memo: '라멘' }));
    const { router, user } = renderApp(`/trips/${trip.id}?day=${DAY2}`);

    // Only what is linked to the place, with the total in the settlement currency.
    await user.click(await findCard('오사카성'));
    expect(spent()).toHaveTextContent('천수각 입장권');
    expect(spent()).toHaveTextContent('¥1,200≈ 10,800원');
    expect(spent()).toHaveTextContent('합계 10,800원');
    expect(spent()).not.toHaveTextContent('라멘');

    // A new expense starts linked to the place, on its day.
    await user.click(within(spent()).getByRole('link', { name: '지출 추가' }));
    expect(await screen.findByRole('heading', { name: '지출 추가' })).toBeInTheDocument();
    expect(await screen.findByLabelText('일정 연결')).toHaveValue(castle.id);
    expect(screen.getByLabelText('날짜')).toHaveValue(DAY2);
    await user.type(screen.getByLabelText('금액'), '3000');
    await user.click(screen.getByRole('radio', { name: '식비' }));
    await user.type(screen.getByLabelText('메모'), '타코야키');
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByRole('link', { name: /타코야키/ })).toHaveTextContent('오사카성');

    await router.navigate(`/trips/${trip.id}?day=${DAY2}`);
    await user.click(await findCard('오사카성'));
    expect(spent()).toHaveTextContent('타코야키');
    expect(spent()).toHaveTextContent('합계 13,800원');

    await router.navigate(`/trips/${trip.id}?day=${DAY2}`);
    await user.click(await findCard('도톤보리'));
    expect(spent()).toHaveTextContent('이 일정에 연결된 지출이 없어요.');
  });

  it('saves what was changed in the sheet before going to an expense', async () => {
    const castle = await addPlace('오사카성');
    await repositories.expenses.create(
      expense({ date: DAY2, memo: '천수각 입장권', scheduleItemId: castle.id }),
    );
    const { router, user } = renderApp(`/trips/${trip.id}?day=${DAY2}`);

    // Nothing changed: nothing saved (updatedAt decides backup merges).
    await user.click(await findCard('오사카성'));
    await user.click(within(spent()).getByRole('link', { name: /천수각 입장권/ }));
    expect(await screen.findByRole('heading', { name: '지출 수정' })).toBeInTheDocument();
    expect(await repositories.schedule.listByTrip(trip.id)).toEqual([castle]);

    // A memo typed in would be lost on the way: saved first.
    await router.navigate(`/trips/${trip.id}?day=${DAY2}`);
    await user.click(await findCard('오사카성'));
    const sheet = screen.getByRole('dialog', { name: '일정 편집' });
    await user.type(within(sheet).getByLabelText('메모'), '10시 오픈');
    await user.click(within(spent()).getByRole('link', { name: '지출 추가' }));
    expect(await screen.findByRole('heading', { name: '지출 추가' })).toBeInTheDocument();
    expect((await repositories.schedule.listByTrip(trip.id))[0]!.memo).toBe('10시 오픈');
  });
});
