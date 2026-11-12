/** @vitest-environment happy-dom */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { repositories } from '@/data';
import type { Companion, Trip } from '@/data/models';
import type { NewExpense } from '@/data/repositories';
import { formatDateTime } from '@/lib/format';
import { renderApp, resetApp, resetStores, stubPlacesApi, stubRatesApi } from '@/test/app';
import { latestRatesBody, namedPlace, RATES_PUBLISHED_AT } from '@/test/fixtures';
import { DOTONBORI } from '@/test/places';

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
  payerIds: [me.id],
  splitMethod: 'equal',
  participants: [{ companionId: me.id, value: null }],
  title: '',
  memo: '',
  scheduleItemId: null,
  ...overrides,
});

const overview = () => screen.getByRole('region', { name: '가계부 요약' });
const section = (title: string) => screen.getByRole('region', { name: title });
/** Sets a native date input (user-event can't type into them). */
const setDate = (date: string) =>
  fireEvent.change(screen.getByLabelText('날짜'), { target: { value: date } });
/** Ticks who paid ("결제") and who shares ("함께"): a new expense starts with neither. */
async function pick(user: ReturnType<typeof renderApp>['user'], payers: string[], sharing: string[]) {
  for (const name of payers) await user.click(screen.getByRole('checkbox', { name: `${name} 결제` }));
  for (const name of sharing) await user.click(screen.getByRole('checkbox', { name: `${name} 함께` }));
}

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
    expect(screen.getByText('결제한 사람을 한 명 이상 골라 주세요.')).toBeInTheDocument();
    expect(screen.getByText('함께 낼 사람을 한 명 이상 골라 주세요.')).toBeInTheDocument();
    expect(screen.getByLabelText('금액')).toHaveFocus();

    await user.type(screen.getByLabelText('금액'), '10000');
    // Grouped by thousands as it is typed, and read back under it.
    expect(screen.getByLabelText('금액')).toHaveValue('10,000');
    expect(screen.getByText('10,000원')).toBeInTheDocument();
    // In the settlement currency already: nothing to convert.
    expect(screen.queryByText(/^≈/)).toBeNull();
    await user.click(screen.getByRole('radio', { name: '식비' }));
    setDate('2026-11-11');
    await user.type(screen.getByLabelText('제목'), '타코야키');
    await user.type(screen.getByLabelText('메모'), '8개 세트');
    await pick(user, ['나'], ['나', '철수', '영희']);
    // Equal split, the 1-won remainder on the payer
    expect(screen.getByText('3,334원')).toBeInTheDocument();
    expect(screen.getAllByText('3,333원')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: '저장' }));

    // Back on the ledger, under its day
    // A title leads, so the category starts the line under it. The memo stays in the form.
    expect(await screen.findByRole('link', { name: /타코야키/ })).toHaveTextContent(
      /^타코야키식비 · 나 결제 · 3명 균등 · 카드10,000원$/,
    );
    // (The memory router has no browser history, so "back" takes the fallback here.)
    expect(router.state.location.search).toContain('tab=expenses');
    expect(section('Day 2')).toHaveTextContent('Day 2 11.11 (수)합계 10,000원');
    expect(overview()).toHaveTextContent('총 지출10,000원');

    const [saved] = await repositories.expenses.listByTrip(trip.id);
    expect(saved).toMatchObject({ title: '타코야키', memo: '8개 세트' });
    expect(saved!.shares.map((s) => s.amount)).toEqual([3_334, 3_333, 3_333]);
  });

  it('starts with nobody paying or sharing, then splits equally among those ticked', async () => {
    const chulsoo = await addCompanion('철수');
    await addCompanion('영희');
    const { user } = renderApp(`/trips/${trip.id}?tab=expenses`);
    await user.click(await screen.findByRole('link', { name: '지출 추가' }));

    await user.type(await screen.findByLabelText('금액'), '9000');
    await user.click(screen.getByRole('radio', { name: '식비' }));
    // No ways of splitting, no shortcuts: only the boxes, all empty.
    expect(screen.queryByRole('radio', { name: '금액 지정' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^모두/ })).toBeNull();
    expect(screen.queryByRole('button', { name: '결제한 사람만' })).toBeNull();
    const ticked = (column: string) =>
      ['나', '철수', '영희'].filter(
        (name) => (screen.getByRole('checkbox', { name: `${name} ${column}` }) as HTMLInputElement).checked,
      );
    expect(ticked('결제')).toEqual([]);
    expect(ticked('함께')).toEqual([]);

    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(screen.getByText('결제한 사람을 한 명 이상 골라 주세요.')).toBeInTheDocument();
    expect(screen.getByText('함께 낼 사람을 한 명 이상 골라 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '나 결제' })).toHaveFocus();

    await pick(user, ['철수'], ['나', '철수']);
    expect(ticked('결제')).toEqual(['철수']);
    expect(ticked('함께')).toEqual(['나', '철수']);
    expect(screen.getAllByText('4,500원')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByRole('link', { name: /^식비/ })).toHaveTextContent(
      '철수 결제 · 2명 균등',
    );
    const [saved] = await repositories.expenses.listByTrip(trip.id);
    expect(saved!.payerIds).toEqual([chulsoo.id]);
    expect(saved!.shares.map((s) => s.amount)).toEqual([4_500, 4_500]);
  });

  it('takes several payers as paying in equal parts: one paid, the other gave half', async () => {
    const chulsoo = await addCompanion('철수');
    const { router, user } = renderApp(`/trips/${trip.id}/expenses/new`);

    await user.type(await screen.findByLabelText('금액'), '1000000');
    await user.click(screen.getByRole('radio', { name: '숙소' }));
    await pick(user, ['나', '철수'], ['나', '철수']);
    expect(screen.getByText('결제한 2명이 똑같이 나눠 낸 것으로 계산해요.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByRole('link', { name: /^숙소/ })).toHaveTextContent(
      '나, 철수 결제 · 2명 균등',
    );
    const [saved] = await repositories.expenses.listByTrip(trip.id);
    expect(saved!.payerIds).toEqual([me.id, chulsoo.id]);

    // Each paid half of it and owes half: nothing to send.
    await router.navigate(`/trips/${trip.id}/expenses/settlement`);
    expect(await screen.findByText('모두 정산했어요.')).toBeInTheDocument();
  });

  it('groups the amount by thousands wherever it is typed, and files flights under 항공', async () => {
    const { user } = renderApp(`/trips/${trip.id}/expenses/new`);
    const amount = await screen.findByLabelText('금액');
    await user.type(amount, '100');
    // Typed in front: the comma comes in, and the caret stays after what was typed.
    await user.type(amount, '1', { initialSelectionStart: 0, initialSelectionEnd: 0 });
    expect(amount).toHaveValue('1,100');
    await user.keyboard('2');
    expect(amount).toHaveValue('12,100');
    // Deleting a comma only steps over it.
    await user.keyboard('{ArrowRight}{Backspace}');
    expect(amount).toHaveValue('12,100');
    await user.keyboard('3');
    expect(amount).toHaveValue('123,100');

    const categories = within(screen.getByRole('group', { name: '카테고리' })).getAllByRole('radio');
    expect(categories.map((radio) => radio.closest('label')!.textContent)).toEqual([
      '식비',
      '교통',
      '항공',
      '숙소',
      '쇼핑',
      '관광',
      '기타',
    ]);
    await user.click(screen.getByRole('radio', { name: '항공' }));
    await user.type(screen.getByLabelText('제목'), '왕복 항공권');
    await pick(user, ['나'], ['나']);
    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByRole('link', { name: /왕복 항공권/ })).toHaveTextContent(
      /^왕복 항공권항공 · 나 결제 · 개인 지출 · 카드123,100원$/,
    );
    const [saved] = await repositories.expenses.listByTrip(trip.id);
    expect(saved).toMatchObject({ amount: 123_100, category: 'flight', title: '왕복 항공권' });

    // Opened again: grouped from the start.
    await user.click(screen.getByRole('link', { name: /왕복 항공권/ }));
    expect(await screen.findByLabelText('금액')).toHaveValue('123,100');
  });

  it('keeps an amount split until its amount or people change, then splits equally', async () => {
    const chulsoo = await addCompanion('철수');
    const created = await repositories.expenses.create(
      expense({
        title: '오코노미야키',
        splitMethod: 'amount',
        participants: [
          { companionId: me.id, value: 7_000 },
          { companionId: chulsoo.id, value: 3_000 },
        ],
      }),
    );
    const { user } = renderApp(`/trips/${trip.id}?tab=expenses`);

    await user.click(await screen.findByRole('link', { name: /오코노미야키/ }));
    const note = '금액을 정해 나눈 지출이에요. 금액이나 함께 낼 사람을 바꾸면 똑같이 나눠요.';
    expect(await screen.findByText(note)).toBeInTheDocument();
    expect(screen.getByText('7,000원')).toBeInTheDocument();
    expect(screen.getByText('3,000원')).toBeInTheDocument();

    // Anything else keeps it.
    await user.type(screen.getByLabelText('제목'), ' 2인분');
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByRole('link', { name: /오코노미야키 2인분/ })).toHaveTextContent(
      '2명 금액 지정',
    );
    let [saved] = await repositories.expenses.listByTrip(trip.id);
    expect(saved!.shares.map((s) => s.amount)).toEqual([7_000, 3_000]);

    // A new amount splits it equally, as the rows show before saving.
    await user.click(screen.getByRole('link', { name: /오코노미야키/ }));
    const amount = await screen.findByLabelText('금액');
    await user.clear(amount);
    await user.type(amount, '12000');
    expect(screen.queryByText(note)).toBeNull();
    expect(screen.getAllByText('6,000원')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByRole('link', { name: /오코노미야키/ })).toHaveTextContent('2명 균등');
    [saved] = await repositories.expenses.listByTrip(trip.id);
    expect(saved).toMatchObject({ id: created.id, splitMethod: 'equal', amount: 12_000 });
    expect(saved!.shares.map((s) => s.amount)).toEqual([6_000, 6_000]);
  });

  it('converts other currencies with the entered rate, then offers it again', async () => {
    const { user } = renderApp(`/trips/${trip.id}/expenses/new`);

    await user.selectOptions(await screen.findByLabelText('통화'), 'JPY · 엔');
    await user.type(screen.getByLabelText('금액'), '1200');
    await user.click(screen.getByRole('radio', { name: '교통' }));
    await pick(user, ['나'], ['나']);
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
    await pick(user, ['나'], ['나']);
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
        payerIds: [otherMe.id],
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
    // No title: the category is the title, and is not repeated under it.
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
    await repositories.expenses.create(expense({ title: '편의점' }));
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
        title: '택시',
        payerIds: [chulsoo.id],
        participants: [{ companionId: chulsoo.id, value: null }],
      }),
    );
    await repositories.expenses.create(
      expense({
        title: '저녁',
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
    const dinner = (await repositories.expenses.listByTrip(trip.id)).find((e) => e.title === '저녁');
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
        title: '천수각 입장권',
        scheduleItemId: castle.id,
      }),
    );
    await repositories.expenses.create(expense({ date: DAY2, title: '라멘' }));
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
    await user.type(screen.getByLabelText('제목'), '타코야키');
    await pick(user, ['나'], ['나']);
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

  it("links a place not in the schedule, which saving adds to the expense's day", async () => {
    const api = stubPlacesApi([DOTONBORI]);
    await addPlace('오사카성');
    const { router, user } = renderApp(`/trips/${trip.id}/expenses/new`);

    await user.type(await screen.findByLabelText('금액'), '3000');
    await user.click(screen.getByRole('radio', { name: '식비' }));
    await user.type(screen.getByLabelText('제목'), '도톤보리');
    setDate(DAY2);
    await pick(user, ['나'], ['나']);

    // Searches the title right away.
    await user.click(screen.getByRole('button', { name: '장소 찾기' }));
    const finder = await screen.findByRole('dialog', { name: '장소 찾기' });
    expect(within(finder).getByLabelText('장소 이름')).toHaveValue('도톤보리');
    await user.click(await within(finder).findByRole('button', { name: /^도톤보리/ }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '장소 찾기' })).toBeNull());

    const link = screen.getByRole('group', { name: '일정 연결' });
    expect(link).toHaveTextContent(DOTONBORI.address);
    expect(link).toHaveTextContent('저장하면 Day 2 일정에도 들어가요.');
    expect(link).toHaveTextContent('Google Maps');
    await user.click(screen.getByRole('button', { name: '저장' }));

    // In the ledger with its place, and in the schedule at the end of that day.
    expect(await screen.findByRole('link', { name: /^도톤보리/ })).toHaveTextContent(
      /^도톤보리식비 · 나 결제 · 개인 지출 · 카드도톤보리3,000원$/,
    );
    const items = await repositories.schedule.listByTrip(trip.id);
    expect(items.map((item) => [item.date, item.order, item.place.name])).toEqual([
      [DAY2, 0, '오사카성'],
      [DAY2, 1, '도톤보리'],
    ]);
    expect(items[1]!.place).toMatchObject({ placeId: DOTONBORI.placeId, address: DOTONBORI.address });
    const [saved] = await repositories.expenses.listByTrip(trip.id);
    expect(saved!.scheduleItemId).toBe(items[1]!.id);
    expect(api.fetched).toHaveLength(1);

    await router.navigate(`/trips/${trip.id}?day=${DAY2}`);
    await user.click(await findCard('도톤보리'));
    expect(spent()).toHaveTextContent('도톤보리');
  });

  it('puts a place found for an expense outside the trip into the inbox, until taken off', async () => {
    stubPlacesApi([DOTONBORI]);
    const { user } = renderApp(`/trips/${trip.id}/expenses/new`);

    // Nothing in the schedule yet: a button to find one.
    await user.click(await screen.findByRole('button', { name: '일정 연결 장소 찾기' }));
    const finder = await screen.findByRole('dialog', { name: '장소 찾기' });
    await user.type(within(finder).getByLabelText('장소 이름'), '도톤보리');
    await user.click(await within(finder).findByRole('button', { name: /^도톤보리/ }));
    setDate('2026-11-01');
    expect(await screen.findByText('여행 기간 밖의 지출이라, 저장하면 일정의 보관함에 들어가요.')).toBeInTheDocument();

    // Taken off: nothing is added.
    await user.click(screen.getByRole('button', { name: '도톤보리 연결 빼기' }));
    expect(screen.getByRole('button', { name: '일정 연결 장소 찾기' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '일정 연결 장소 찾기' }));
    const again = await screen.findByRole('dialog', { name: '장소 찾기' });
    await user.type(within(again).getByLabelText('장소 이름'), '도톤보리');
    await user.click(await within(again).findByRole('button', { name: /^도톤보리/ }));

    await user.type(screen.getByLabelText('금액'), '50000');
    await user.click(screen.getByRole('radio', { name: '숙소' }));
    await pick(user, ['나'], ['나']);
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(async () => expect(await repositories.expenses.listByTrip(trip.id)).toHaveLength(1));
    const items = await repositories.schedule.listByTrip(trip.id);
    expect(items.map((item) => [item.date, item.place.name])).toEqual([[null, '도톤보리']]);
  });

  it('saves what was changed in the sheet before going to an expense', async () => {
    const castle = await addPlace('오사카성');
    await repositories.expenses.create(
      expense({ date: DAY2, title: '천수각 입장권', scheduleItemId: castle.id }),
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
