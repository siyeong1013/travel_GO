/** @vitest-environment happy-dom */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { repositories } from '@/data';
import type { Trip } from '@/data/models';
import type { FlightAnswer, FlightLeg } from '@/lib/flights';
import { pickTripDates, renderApp, resetApp, stubPlacesApi, stubSupabase } from '@/test/app';
import { namedPlace, typedCity } from '@/test/fixtures';
import { kakaoUser, supabaseFake } from '@/test/supabase';

vi.mock('@/data', async () => (await import('@/test/fixtures')).createTestData());

vi.mock('@supabase/supabase-js', async () => {
  const { supabaseFake } = await import('@/test/supabase');
  return { createClient: () => supabaseFake.client };
});

const INCHEON = { lat: 37.46, lng: 126.44 };
const KANSAI = { lat: 34.43, lng: 135.24 };

const KE723: FlightAnswer = {
  status: 'ok',
  flights: [
    {
      number: 'KE723',
      airline: 'Korean Air',
      departure: { iata: 'ICN', name: 'Incheon', countryCode: 'KR', location: INCHEON, date: '2026-12-01', time: '09:00', terminal: '2' },
      arrival: { iata: 'KIX', name: 'Kansai', countryCode: 'JP', location: KANSAI, date: '2026-12-01', time: '10:55', terminal: '1' },
    },
  ],
};

const KE724: FlightAnswer = {
  status: 'ok',
  flights: [
    {
      number: 'KE724',
      airline: 'Korean Air',
      departure: { iata: 'KIX', name: 'Kansai', countryCode: 'JP', location: KANSAI, date: '2026-12-03', time: '12:00', terminal: '1' },
      arrival: { iata: 'ICN', name: 'Incheon', countryCode: 'KR', location: INCHEON, date: '2026-12-03', time: '14:00', terminal: '2' },
    },
  ],
};

const OKINAWA = { lat: 26.2, lng: 127.65 };

const MM101: FlightAnswer = {
  status: 'ok',
  flights: [
    {
      number: 'MM101',
      airline: 'Peach',
      departure: { iata: 'KIX', name: 'Kansai', countryCode: 'JP', location: KANSAI, date: '2026-12-02', time: '07:00', terminal: '2' },
      arrival: { iata: 'OKA', name: 'Naha', countryCode: 'JP', location: OKINAWA, date: '2026-12-02', time: '09:20', terminal: null },
    },
  ],
};

let trip: Trip;

beforeEach(async () => {
  await resetApp();
  supabaseFake.reset();
  stubSupabase();
  trip = await repositories.trips.create({
    title: '오사카 여행',
    cities: [typedCity('오사카')],
    startDate: '2026-12-01',
    endDate: '2026-12-03',
  });
});

/**
 * The app's server function answers `answer`, or for the number asked, found on the day it leaves
 * only (not found otherwise), and records what it was asked.
 */
function stubFlightApi(answer: FlightAnswer | Record<string, FlightAnswer>) {
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
    if ('status' in answer) return Response.json(answer);
    const params = new URL(String(input), 'http://app').searchParams;
    const found = answer[params.get('number') ?? ''];
    const leaves = found?.status === 'ok' && found.flights[0]?.departure.date === params.get('date');
    return Response.json(leaves ? found : { status: 'notFound' });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

/** Opens the flight sheet from Day 2: where it opens doesn't matter. */
async function openFlights() {
  const { user } = renderApp(`/trips/${trip.id}?day=2026-12-02`);
  await user.click(await screen.findByRole('button', { name: '항공편 추가' }));
  const sheet = screen.getByRole('dialog', { name: '항공편 추가' });
  const out = within(sheet).getByRole('group', { name: '항공편 1' });
  const back = within(sheet).getByRole('group', { name: '항공편 2' });
  return { user, sheet, out, back };
}

const schedule = async () =>
  (await repositories.schedule.listByTrip(trip.id)).map((item) => [
    item.date,
    item.time,
    item.place.name,
  ]);

/** Text as it reads, though split among elements (a flight's route, broken between its ends). */
const reads = (text: string) => (_: string, element: Element | null) => element?.textContent === text;

/** A flight looked up as it's typed: its answer, once the typing has paused and it came. */
const answer = (row: HTMLElement, text: string | RegExp) =>
  within(row).findByText(typeof text === 'string' ? reads(text) : text, undefined, { timeout: 3000 });

describe('adding flights', () => {
  it('looks each up as it is typed, and puts it in on the day it leaves', async () => {
    supabaseFake.signedIn(kakaoUser());
    const fetch = stubFlightApi({ KE723, KE724 });
    const { user, sheet, out, back } = await openFlights();
    // The trip's first and last days to begin with.
    expect(within(out).getByLabelText('출발일')).toHaveValue('2026-12-01');
    expect(within(out).getByText('Day 1에 들어가요')).toBeInTheDocument();
    expect(within(back).getByLabelText('출발일')).toHaveValue('2026-12-03');
    expect(within(back).getByText('Day 3에 들어가요')).toBeInTheDocument();

    await user.type(within(out).getByLabelText('편명'), 'ke723');
    await user.type(within(back).getByLabelText('편명'), 'KE724');
    expect(within(sheet).getByRole('button', { name: '항공편을 찾고 있어요' })).toBeDisabled();
    expect(await answer(out, '인천(ICN) 09:00 → 간사이(KIX) 10:55')).toBeInTheDocument();
    expect(await answer(back, '간사이(KIX) 12:00 → 인천(ICN) 14:00')).toBeInTheDocument();
    // Each asked once, when the typing stopped.
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      '/api/flight?number=KE723&date=2026-12-01',
      '/api/flight?number=KE724&date=2026-12-03',
    ]);
    expect(new Headers(fetch.mock.calls[0]![1]?.headers).get('Authorization')).toBe('Bearer access');
    expect(within(out).getByRole('radio', { name: /^KE723 · Korean Air/ })).toBeChecked();
    expect(within(out).getByRole('link', { name: 'AeroDataBox' })).toHaveAttribute('rel', 'noopener');

    await user.click(within(sheet).getByRole('button', { name: '일정에 넣기' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '항공편 추가' })).toBeNull());
    expect(await screen.findByText('KE723을 Day 1에, KE724를 Day 3에 넣었어요.')).toBeInTheDocument();
    // Each: the airport it leaves from, with the flight in its memo, then the one it lands at.
    expect(await schedule()).toEqual([
      ['2026-12-01', '09:00', '인천 공항 (ICN)'],
      ['2026-12-01', '10:55', '간사이 공항 (KIX)'],
      ['2026-12-03', '12:00', '간사이 공항 (KIX)'],
      ['2026-12-03', '14:00', '인천 공항 (ICN)'],
    ]);
    const [there, landed] = await repositories.schedule.listByTrip(trip.id);
    expect(there).toMatchObject({
      place: { placeId: null, address: null, location: INCHEON },
      memo: 'KE723 인천 → 간사이 · Korean Air\n인천 T2 출발 → 간사이 T1 도착 10:55',
    });
    expect(landed).toMatchObject({ place: { placeId: null, location: KANSAI }, memo: '' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('takes more flights, as a multi-city booking does, each on its day', async () => {
    supabaseFake.signedIn(kakaoUser());
    const fetch = stubFlightApi({ KE723, KE724, MM101 });
    const { user, sheet, out, back } = await openFlights();
    await user.click(within(sheet).getByRole('button', { name: '항공편 더 넣기' }));
    const third = within(sheet).getByRole('group', { name: '항공편 3' });
    // On the last day to begin with.
    expect(within(third).getByLabelText('출발일')).toHaveValue('2026-12-03');

    await user.type(within(out).getByLabelText('편명'), 'KE723');
    await user.type(within(back).getByLabelText('편명'), 'KE724');
    fireEvent.change(within(third).getByLabelText('출발일'), { target: { value: '2026-12-02' } });
    await user.type(within(third).getByLabelText('편명'), 'MM101');
    expect(within(third).getByText('Day 2에 들어가요')).toBeInTheDocument();
    expect(await answer(third, '간사이(KIX) 07:00 → 오키나와(OKA) 09:20')).toBeInTheDocument();
    await answer(back, '간사이(KIX) 12:00 → 인천(ICN) 14:00');
    expect(fetch).toHaveBeenCalledTimes(3);

    await user.click(within(sheet).getByRole('button', { name: '일정에 넣기' }));
    // Told in the trip's order.
    expect(
      await screen.findByText('KE723을 Day 1에, MM101을 Day 2에, KE724를 Day 3에 넣었어요.'),
    ).toBeInTheDocument();
    expect(await schedule()).toEqual([
      ['2026-12-01', '09:00', '인천 공항 (ICN)'],
      ['2026-12-01', '10:55', '간사이 공항 (KIX)'],
      ['2026-12-02', '07:00', '간사이 공항 (KIX)'],
      ['2026-12-02', '09:20', '오키나와 공항 (OKA)'],
      ['2026-12-03', '12:00', '간사이 공항 (KIX)'],
      ['2026-12-03', '14:00', '인천 공항 (ICN)'],
    ]);
  });

  it('picks one of the legs a number flies that day', async () => {
    supabaseFake.signedIn(kakaoUser());
    const through: FlightAnswer = {
      status: 'ok',
      flights: [
        { ...(KE723 as { flights: FlightLeg[] }).flights[0]!, number: 'KE001' },
        {
          number: 'KE001',
          airline: 'Korean Air',
          departure: { iata: 'KIX', name: 'Kansai', countryCode: 'JP', location: KANSAI, date: '2026-12-01', time: '12:30', terminal: '1' },
          arrival: { iata: 'OKA', name: 'Naha', countryCode: 'JP', location: OKINAWA, date: '2026-12-01', time: '14:50', terminal: null },
        },
      ],
    };
    stubFlightApi({ KE001: through });
    const { user, sheet, out } = await openFlights();
    await user.type(within(out).getByLabelText('편명'), 'KE001{Enter}');
    await answer(out, '간사이(KIX) 12:30 → 오키나와(OKA) 14:50');
    const [first, second] = within(out).getAllByRole('radio');
    expect(first).toBeChecked();
    await user.click(second!);
    expect(second).toBeChecked();

    await user.click(within(sheet).getByRole('button', { name: '일정에 넣기' }));
    expect(await screen.findByText('KE001을 Day 1에 넣었어요.')).toBeInTheDocument();
    expect(await schedule()).toEqual([
      ['2026-12-01', '12:30', '간사이 공항 (KIX)'],
      ['2026-12-01', '14:50', '오키나와 공항 (OKA)'],
    ]);
  });

  it('takes a flight out, keeping one at least', async () => {
    const { user, sheet, back } = await openFlights();
    await user.click(within(sheet).getByRole('button', { name: '항공편 더 넣기' }));
    await user.type(within(back).getByLabelText('편명'), 'KE724');
    await user.click(within(sheet).getByRole('button', { name: '항공편 1 빼기' }));
    // The rest move up.
    expect(within(sheet).queryByRole('group', { name: '항공편 3' })).toBeNull();
    const first = within(sheet).getByRole('group', { name: '항공편 1' });
    expect(within(first).getByLabelText('편명')).toHaveValue('KE724');
    await user.click(within(sheet).getByRole('button', { name: '항공편 2 빼기' }));
    expect(within(sheet).getAllByRole('group')).toHaveLength(1);
    expect(within(sheet).queryByRole('button', { name: /빼기$/ })).toBeNull();
  });

  it('asks again only for what changed, and at once on Enter', async () => {
    supabaseFake.signedIn(kakaoUser());
    const fetch = stubFlightApi({ KE724 });
    const { user, sheet, back } = await openFlights();
    await user.type(within(back).getByLabelText('편명'), 'KE724{Enter}');
    // Enter doesn't wait for the typing to stop.
    expect(await within(back).findByText(reads('간사이(KIX) 12:00 → 인천(ICN) 14:00'))).toBeInTheDocument();

    // Another day: asked again.
    fireEvent.change(within(back).getByLabelText('출발일'), { target: { value: '2026-12-02' } });
    expect(await answer(back, /^이 날짜에 출발하는 항공편을 찾지 못했어요/)).toHaveTextContent(
      '이 날짜에 출발하는 항공편을 찾지 못했어요. 편명과 날짜를 확인해 주세요. 넣으면 편명만 그 날 일정에 들어가요.',
    );
    // Back to the first day: its answer is known.
    fireEvent.change(within(back).getByLabelText('출발일'), { target: { value: '2026-12-03' } });
    expect(await answer(back, '간사이(KIX) 12:00 → 인천(ICN) 14:00')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);

    fireEvent.change(within(back).getByLabelText('출발일'), { target: { value: '2026-12-02' } });
    await answer(back, /^이 날짜에 출발하는 항공편을 찾지 못했어요/);
    await user.click(within(sheet).getByRole('button', { name: '일정에 넣기' }));
    expect(await screen.findByText('KE724를 Day 2에 넣었어요.')).toBeInTheDocument();
    expect(await schedule()).toEqual([['2026-12-02', null, 'KE724']]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('puts them in by number when it can’t look them up, outside the trip in the inbox', async () => {
    const fetch = stubFlightApi({ KE723, KE724 });
    const { user, sheet, out, back } = await openFlights();
    await user.type(within(out).getByLabelText('편명'), 'KE723');
    fireEvent.change(within(back).getByLabelText('출발일'), { target: { value: '2026-12-04' } });
    expect(within(back).getByText('보관함에 들어가요')).toBeInTheDocument();
    await user.type(within(back).getByLabelText('편명'), 'KE724');

    expect(await answer(out, /^로그인하면 항공편 정보를 불러올 수 있어요/)).toBeInTheDocument();
    expect(await answer(back, /^로그인하면 항공편 정보를 불러올 수 있어요/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();

    await user.click(within(sheet).getByRole('button', { name: '일정에 넣기' }));
    expect(await screen.findByText('KE723을 Day 1에, KE724를 보관함에 넣었어요.')).toBeInTheDocument();
    expect(await schedule()).toEqual([
      ['2026-12-01', null, 'KE723'],
      [null, null, 'KE724'],
    ]);
  });

  it('takes flight numbers only', async () => {
    const fetch = stubFlightApi(KE723);
    const { user, sheet, out, back } = await openFlights();
    await user.click(within(sheet).getByRole('button', { name: '일정에 넣기' }));
    expect(within(out).getByText('편명을 입력해 주세요.')).toBeInTheDocument();
    await user.type(within(back).getByLabelText('편명'), '오사카성');
    await user.click(within(sheet).getByRole('button', { name: '일정에 넣기' }));
    expect(within(back).getByText('편명을 확인해 주세요. 예: KE723')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    expect(await repositories.schedule.listByTrip(trip.id)).toEqual([]);
  });

  it('isn’t in place search: a flight number typed there points to it, unsearched', async () => {
    const places = stubPlacesApi([]);
    const { user } = renderApp(`/trips/${trip.id}?day=2026-12-02`);
    await user.click(await screen.findByRole('button', { name: '장소 추가' }));
    await user.type(screen.getByLabelText('장소 이름'), 'ke723');
    expect(screen.getByRole('button', { name: /'ke723' 그대로 추가/ })).toBeInTheDocument();
    // Each search is billed.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(places.requests).toEqual([]);

    await user.click(screen.getByRole('button', { name: /^항공편 추가에서 KE723 찾기/ }));
    expect(screen.queryByRole('dialog', { name: '장소 추가' })).toBeNull();
    // On the day chosen there: the one being looked at, to begin with.
    const out = screen.getByRole('group', { name: '항공편 1' });
    expect(within(out).getByLabelText('편명')).toHaveValue('KE723');
    expect(within(out).getByLabelText('출발일')).toHaveValue('2026-12-02');
  });

  it('takes a flight number typed for the last day as the way back', async () => {
    stubPlacesApi([]);
    const { user } = renderApp(`/trips/${trip.id}?day=2026-12-01`);
    await user.click(await screen.findByRole('button', { name: '장소 추가' }));
    // The day chosen in the sheet, not the one being looked at.
    await user.selectOptions(screen.getByLabelText('날짜'), 'Day 3 · 12.3 (목)');
    await user.type(screen.getByLabelText('장소 이름'), 'KE724');
    await user.click(screen.getByRole('button', { name: /^항공편 추가에서 KE724 찾기/ }));
    const back = screen.getByRole('group', { name: '항공편 2' });
    expect(within(back).getByLabelText('편명')).toHaveValue('KE724');
    expect(within(screen.getByRole('group', { name: '항공편 1' })).getByLabelText('편명')).toHaveValue('');
  });

  it('searches a place again once it is no flight number', async () => {
    const places = stubPlacesApi([]);
    const { user } = renderApp(`/trips/${trip.id}?day=2026-12-01`);
    await user.click(await screen.findByRole('button', { name: '장소 추가' }));
    await user.type(screen.getByLabelText('장소 이름'), 'KE723 라운지');
    await waitFor(() => expect(places.requests).toHaveLength(1));
    expect(screen.queryByRole('button', { name: /항공편 추가에서/ })).toBeNull();
  });

  it('is on the inbox too: flights go on their own days', async () => {
    const { user } = renderApp(`/trips/${trip.id}?day=inbox`);
    await user.click(await screen.findByRole('button', { name: '항공편 추가' }));
    const out = screen.getByRole('group', { name: '항공편 1' });
    expect(within(out).getByLabelText('출발일')).toHaveValue('2026-12-01');
  });
});

describe('a flight number only in the schedule', () => {
  /** Opens the item as a trip's flight not found goes in: by its number. */
  async function openItem(user: ReturnType<typeof renderApp>['user'], number: string) {
    await user.click(await screen.findByRole('button', { name: new RegExp(`^${number}(?! 순서 바꾸기)`) }));
    return screen.getByRole('dialog', { name: '일정 편집' });
  }

  it('is filled in from the flight leaving that day, where it is', async () => {
    supabaseFake.signedIn(kakaoUser());
    const fetch = stubFlightApi(KE723);
    const item = { tripId: trip.id, date: '2026-12-01' } as const;
    await repositories.schedule.create({ ...item, place: namedPlace('KE723'), memo: '좌석 32A' });
    await repositories.schedule.create({ ...item, place: namedPlace('호텔 체크인') });
    const { user } = renderApp(`/trips/${trip.id}?day=2026-12-01`);
    const sheet = await openItem(user, 'KE723');

    // In place of finding it as a place.
    expect(within(sheet).queryByText('주소와 위치가 없어요.')).toBeNull();
    await user.click(within(sheet).getByRole('button', { name: /^KE723 항공편 정보 불러오기/ }));
    expect(String(fetch.mock.calls[0]![0])).toBe('/api/flight?number=KE723&date=2026-12-01');
    await user.click(await within(sheet).findByRole('button', { name: /이 항공편으로 채우기$/ }));
    // The airport it leaves from, at its time.
    expect(within(sheet).getByLabelText('장소 이름')).toHaveValue('인천 공항 (ICN)');
    expect(within(sheet).getByLabelText('시간')).toHaveValue('09:00');
    expect(within(sheet).getByText('항공편 정보의 공항 위치예요.')).toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: /항공편 정보 불러오기/ })).toBeNull();
    // The flight in the memo, what was written under it.
    expect(within(sheet).getByLabelText('메모')).toHaveValue(
      'KE723 인천 → 간사이 · Korean Air\n인천 T2 출발 → 간사이 T1 도착 10:55\n좌석 32A',
    );
    // Saved with the rest only.
    expect((await repositories.schedule.listByTrip(trip.id))[0]!.place.name).toBe('KE723');

    await user.click(within(sheet).getByRole('button', { name: '저장' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '일정 편집' })).toBeNull());
    // The airport it lands at, right after it.
    await waitFor(async () => expect(await repositories.schedule.listByTrip(trip.id)).toHaveLength(3));
    const items = await repositories.schedule.listByTrip(trip.id);
    expect(items.map(({ order, time, place, memo }) => [order, time, place.name, memo])).toEqual([
      [0, '09:00', '인천 공항 (ICN)', 'KE723 인천 → 간사이 · Korean Air\n인천 T2 출발 → 간사이 T1 도착 10:55\n좌석 32A'],
      [1, '10:55', '간사이 공항 (KIX)', ''],
      [2, null, '호텔 체크인', ''],
    ]);
    expect(items[0]!.place).toMatchObject({ placeId: null, address: null, location: INCHEON });
    expect(items[1]!.place).toMatchObject({ placeId: null, address: null, location: KANSAI });
  });

  it('becomes its airports when it was filled in before they came along', async () => {
    supabaseFake.signedIn(kakaoUser());
    stubFlightApi(KE723);
    await repositories.schedule.create({
      tripId: trip.id,
      date: '2026-12-01',
      place: namedPlace('KE723 인천 → 간사이'),
      time: '09:00',
      memo: 'Korean Air · 인천 T2 출발 → 간사이 T1 도착 10:55',
    });
    const { user } = renderApp(`/trips/${trip.id}?day=2026-12-01`);
    const sheet = await openItem(user, 'KE723 인천 → 간사이');

    await user.click(within(sheet).getByRole('button', { name: /^KE723 항공편 정보 불러오기/ }));
    await user.click(await within(sheet).findByRole('button', { name: /이 항공편으로 채우기$/ }));
    // The memo has the flight once: the way it was written before gives way.
    const memo = 'KE723 인천 → 간사이 · Korean Air\n인천 T2 출발 → 간사이 T1 도착 10:55';
    expect(within(sheet).getByLabelText('메모')).toHaveValue(memo);

    await user.click(within(sheet).getByRole('button', { name: '저장' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '일정 편집' })).toBeNull());
    await waitFor(async () => expect(await schedule()).toHaveLength(2));
    expect(await schedule()).toEqual([
      ['2026-12-01', '09:00', '인천 공항 (ICN)'],
      ['2026-12-01', '10:55', '간사이 공항 (KIX)'],
    ]);
    expect((await repositories.schedule.listByTrip(trip.id))[0]!.memo).toBe(memo);
  });

  it('writes when it lands the next day as the route does, over the memo written before', async () => {
    supabaseFake.signedIn(kakaoUser());
    const late: FlightLeg = {
      number: 'KE724',
      airline: 'Korean Air',
      departure: { iata: 'KIX', name: 'Kansai', countryCode: 'JP', location: KANSAI, date: '2026-12-03', time: '22:30', terminal: '1' },
      arrival: { iata: 'ICN', name: 'Incheon', countryCode: 'KR', location: INCHEON, date: '2026-12-04', time: '00:40', terminal: '2' },
    };
    stubFlightApi({ status: 'ok', flights: [late] });
    await repositories.schedule.create({
      tripId: trip.id,
      date: '2026-12-03',
      place: namedPlace('KE724 간사이 → 인천'),
      memo: 'Korean Air · 간사이 T1 출발 → 인천 T2 도착 다음 날 00:40\n좌석 32A',
    });
    const { user } = renderApp(`/trips/${trip.id}?day=2026-12-03`);
    const sheet = await openItem(user, 'KE724 간사이 → 인천');

    await user.click(within(sheet).getByRole('button', { name: /^KE724 항공편 정보 불러오기/ }));
    await user.click(await within(sheet).findByRole('button', { name: /이 항공편으로 채우기$/ }));
    expect(within(sheet).getByLabelText('메모')).toHaveValue(
      'KE724 간사이 → 인천 · Korean Air\n간사이 T1 출발 → 인천 T2 도착 00:40(+1일)\n좌석 32A',
    );
  });

  it('is a place like any other once it has its airport', async () => {
    const place = { ...namedPlace('KE723 인천 → 간사이'), address: '간사이 공항 (KIX)', location: KANSAI };
    await repositories.schedule.create({ tripId: trip.id, date: '2026-12-01', place });
    const { user } = renderApp(`/trips/${trip.id}?day=2026-12-01`);
    const sheet = await openItem(user, 'KE723 인천 → 간사이');
    expect(within(sheet).getByText('간사이 공항 (KIX)')).toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: /항공편 정보 불러오기/ })).toBeNull();
  });

  it('is looked up on the day picked for it, which the inbox has not', async () => {
    supabaseFake.signedIn(kakaoUser());
    const fetch = stubFlightApi({ status: 'notFound' });
    await repositories.schedule.create({ tripId: trip.id, date: null, place: namedPlace('KE724') });
    const { user } = renderApp(`/trips/${trip.id}?day=inbox`);
    const sheet = await openItem(user, 'KE724');

    expect(within(sheet).getByText('날짜를 고르면 KE724 항공편 정보를 불러올 수 있어요.')).toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: /항공편 정보 불러오기/ })).toBeNull();

    await user.selectOptions(within(sheet).getByLabelText('날짜'), '2026-12-03');
    await user.click(within(sheet).getByRole('button', { name: /^KE724 항공편 정보 불러오기 Day 3/ }));
    expect(String(fetch.mock.calls[0]![0])).toBe('/api/flight?number=KE724&date=2026-12-03');
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('이 날짜에 출발하는 항공편을 찾지 못했어요.');

    // Another day, another lookup.
    await user.selectOptions(within(sheet).getByLabelText('날짜'), '2026-12-02');
    expect(within(sheet).getByRole('button', { name: /^KE724 항공편 정보 불러오기 Day 2/ })).toBeInTheDocument();
  });
});

describe("a new trip's flights", () => {
  it('go into its schedule once found, and the countries they land in into its own', async () => {
    supabaseFake.signedIn(kakaoUser());
    const fetch = stubFlightApi({ KE723 });
    const { user, router } = renderApp('/trips/new');
    await user.type(await screen.findByLabelText('여행 이름'), '간사이 여행');
    await user.type(screen.getByLabelText('도시'), '오사카');
    await pickTripDates(user, '2026-12-01', '2026-12-03');

    await user.click(screen.getByRole('button', { name: '항공편 넣기' }));
    const first = screen.getByRole('group', { name: '항공편 1' });
    // The way there leaves on the first day.
    expect(within(first).getByLabelText('출발일')).toHaveValue('2026-12-01');
    await user.type(within(first).getByLabelText('편명'), 'ke723');
    // Looked up as it is typed.
    expect(await answer(first, '인천(ICN) 09:00 → 간사이(KIX) 10:55')).toBeInTheDocument();
    expect(String(fetch.mock.calls[0]![0])).toBe('/api/flight?number=KE723&date=2026-12-01');
    // It lands in Japan.
    expect(screen.getByRole('button', { name: '일본 빼기' })).toBeInTheDocument();

    // The way back isn't found: it goes in by its number on its day.
    await user.click(screen.getByRole('button', { name: '항공편 더 넣기' }));
    const second = screen.getByRole('group', { name: '항공편 2' });
    expect(within(second).getByLabelText('출발일')).toHaveValue('2026-12-03');
    await user.type(within(second).getByLabelText('편명'), 'KE724');
    // Making the trip waits for the answer.
    expect(screen.getByRole('button', { name: '만들기' })).toBeDisabled();
    await answer(second, /^이 날짜에 출발하는 항공편을 찾지 못했어요/);

    await user.click(screen.getByRole('button', { name: '만들기' }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/trips\/[0-9a-f-]{36}$/));
    const created = (await repositories.trips.list()).find((t) => t.title === '간사이 여행')!;
    expect(created.countries).toEqual(['JP']);
    const items = await repositories.schedule.listByTrip(created.id);
    expect(items.map((item) => [item.date, item.time, item.place.name])).toEqual([
      ['2026-12-01', '09:00', '인천 공항 (ICN)'],
      ['2026-12-01', '10:55', '간사이 공항 (KIX)'],
      ['2026-12-03', null, 'KE724'],
    ]);
    expect(items[1]!.place.location).toEqual(KANSAI);
  });
});
