/** @vitest-environment happy-dom */
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { repositories } from '@/data';
import type { Trip } from '@/data/models';
import type { FlightAnswer } from '@/lib/flights';
import { pickTripDates, renderApp, resetApp, stubPlacesApi, stubSupabase } from '@/test/app';
import { typedCity } from '@/test/fixtures';
import { kakaoUser, supabaseFake } from '@/test/supabase';

vi.mock('@/data', async () => (await import('@/test/fixtures')).createTestData());

vi.mock('@supabase/supabase-js', async () => {
  const { supabaseFake } = await import('@/test/supabase');
  return { createClient: () => supabaseFake.client };
});

const KE723: FlightAnswer = {
  status: 'ok',
  flights: [
    {
      number: 'KE723',
      airline: 'Korean Air',
      departure: { iata: 'ICN', name: 'Incheon', countryCode: 'KR', date: '2026-12-01', time: '09:00', terminal: '2' },
      arrival: { iata: 'KIX', name: 'Kansai', countryCode: 'JP', date: '2026-12-01', time: '10:55', terminal: '1' },
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

/** The app's server function answers `answer` (and records what it was asked). */
function stubFlightApi(answer: FlightAnswer) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(answer));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

async function typeFlight(number: string) {
  const { user } = renderApp(`/trips/${trip.id}?day=2026-12-01`);
  await user.click(await screen.findByRole('button', { name: 'Day 1에 장소 추가' }));
  await user.type(screen.getByLabelText('장소 이름'), number);
  return user;
}

describe('adding a flight', () => {
  it('looks a flight number up for the day, and puts it in at its departure time', async () => {
    supabaseFake.signedIn(kakaoUser());
    const fetch = stubFlightApi(KE723);
    const user = await typeFlight('ke723');

    await user.click(screen.getByRole('button', { name: /^KE723 항공편 정보 불러오기/ }));
    const sheet = screen.getByRole('dialog', { name: '장소 추가' });
    expect(within(sheet).getByRole('link', { name: 'AeroDataBox' })).toHaveAttribute('rel', 'noopener');
    expect(String(fetch.mock.calls[0]![0])).toBe('/api/flight?number=KE723&date=2026-12-01');
    expect(new Headers(fetch.mock.calls[0]![1]?.headers).get('Authorization')).toBe('Bearer access');

    await user.click(await within(sheet).findByRole('button', { name: /이 항공편 추가$/ }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '장소 추가' })).toBeNull());
    const [item] = await repositories.schedule.listByTrip(trip.id);
    expect(item).toMatchObject({
      date: '2026-12-01',
      time: '09:00',
      place: { name: 'KE723 인천 → 간사이', placeId: null, location: null },
      memo: 'Korean Air · 인천 T2 출발 → 간사이 T1 도착 10:55',
    });
  });

  it('asks to sign in first', async () => {
    const fetch = stubFlightApi(KE723);
    const user = await typeFlight('KE723');
    await user.click(screen.getByRole('button', { name: /^KE723 항공편 정보 불러오기/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('로그인하면 항공편 정보를 불러올 수 있어요.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('says when that day has no such flight, and the name can still go in as typed', async () => {
    supabaseFake.signedIn(kakaoUser());
    stubFlightApi({ status: 'notFound' });
    const user = await typeFlight('KE999');
    await user.click(screen.getByRole('button', { name: /^KE999 항공편 정보 불러오기/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('이 날짜에 출발하는 항공편을 찾지 못했어요.');

    await user.click(screen.getByRole('button', { name: '추가' }));
    await waitFor(async () => {
      expect((await repositories.schedule.listByTrip(trip.id)).map((i) => i.place.name)).toEqual(['KE999']);
    });
  });

  it('doesn’t search places for a flight number (each search is billed)', async () => {
    const places = stubPlacesApi([]);
    const user = await typeFlight('KE723');
    expect(screen.getByRole('button', { name: /^KE723 항공편 정보 불러오기/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /'KE723' 그대로 추가/ })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(places.requests).toEqual([]);

    // A place again: searched as usual.
    await user.type(screen.getByLabelText('장소 이름'), ' 라운지');
    await waitFor(() => expect(places.requests).toHaveLength(1));
  });

  it('doesn’t offer a lookup for the inbox, which has no day', async () => {
    const { user } = renderApp(`/trips/${trip.id}?day=inbox`);
    await user.click(await screen.findByRole('button', { name: '보관함에 장소 추가' }));
    await user.type(screen.getByLabelText('장소 이름'), 'KE723');
    expect(screen.queryByRole('button', { name: /항공편 정보 불러오기/ })).toBeNull();
  });
});

describe("a new trip's flights", () => {
  it('go into its schedule once found, and the countries they land in into its own', async () => {
    supabaseFake.signedIn(kakaoUser());
    const fetch = stubFlightApi(KE723);
    const { user, router } = renderApp('/trips/new');
    await user.type(await screen.findByLabelText('여행 이름'), '간사이 여행');
    await user.type(screen.getByLabelText('도시'), '오사카');
    await pickTripDates(user, '2026-12-01', '2026-12-03');

    await user.click(screen.getByRole('button', { name: '항공편 넣기' }));
    const first = screen.getByRole('group', { name: '항공편 1' });
    // The way there leaves on the first day.
    expect(within(first).getByLabelText('출발일')).toHaveValue('2026-12-01');
    await user.type(within(first).getByLabelText('편명'), 'ke723');
    await user.click(within(first).getByRole('button', { name: 'KE723 항공편 정보 불러오기' }));
    expect(await within(first).findByText('인천 09:00 → 간사이 10:55')).toBeInTheDocument();
    expect(String(fetch.mock.calls[0]![0])).toBe('/api/flight?number=KE723&date=2026-12-01');
    // It lands in Japan.
    expect(screen.getByRole('button', { name: '일본 빼기' })).toBeInTheDocument();

    // The way back isn't looked up: it goes in by its number on its day.
    await user.click(screen.getByRole('button', { name: '항공편 더 넣기' }));
    const second = screen.getByRole('group', { name: '항공편 2' });
    expect(within(second).getByLabelText('출발일')).toHaveValue('2026-12-03');
    await user.type(within(second).getByLabelText('편명'), 'KE724');

    await user.click(screen.getByRole('button', { name: '만들기' }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/trips\/[0-9a-f-]{36}$/));
    const created = (await repositories.trips.list()).find((t) => t.title === '간사이 여행')!;
    expect(created.countries).toEqual(['JP']);
    const items = await repositories.schedule.listByTrip(created.id);
    expect(items.map((item) => [item.date, item.time, item.place.name])).toEqual([
      ['2026-12-01', '09:00', 'KE723 인천 → 간사이'],
      ['2026-12-03', null, 'KE724'],
    ]);
  });
});
