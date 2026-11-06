/** @vitest-environment happy-dom */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { repositories } from '@/data';
import type { Trip } from '@/data/models';
import { BIAS_RADIUS_METERS } from '@/features/places/placeSearch';
import { SEARCH_DELAY_MS } from '@/features/places/usePlaceSearch';
import { pickTripDates, renderApp, resetApp, stubPlacesApi } from '@/test/app';
import { DOTONBORI, OSAKA, OSAKA_CASTLE } from '@/test/places';

vi.mock('@/data', async () => (await import('@/test/fixtures')).createTestData());

type User = ReturnType<typeof renderApp>['user'];

// Google data is stamped with the real time: the refresh on opening a trip compares with it.
const OSAKA_CITY = {
  name: '오사카',
  placeId: OSAKA.placeId,
  location: OSAKA.location,
  fetchedAt: new Date().toISOString(),
};
/** OSAKA_CITY as found by search during the test (fetched then). */
const FOUND_OSAKA = { ...OSAKA_CITY, fetchedAt: expect.any(String) };
const AROUND_OSAKA = { center: OSAKA.location, radius: BIAS_RADIUS_METERS };

let trip: Trip;

beforeEach(async () => {
  await resetApp();
  trip = await repositories.trips.create({
    title: '오사카 여행',
    cities: [OSAKA_CITY],
    startDate: '2026-11-10',
    endDate: '2026-11-12',
  });
});
afterEach(() => vi.restoreAllMocks());

/** Text of each card in the open tab (number + name + address + memo). */
const cards = () =>
  within(screen.getByRole('tabpanel'))
    .queryAllByRole('listitem')
    .map((li) => li.textContent);

async function openAddSheet(user: User) {
  await user.click(await screen.findByRole('button', { name: 'Day 1에 장소 추가' }));
  return screen.getByRole('dialog', { name: '장소 추가' });
}

/** Failures are logged for the developer; keep the test output clean. */
const silenceErrors = () => vi.spyOn(console, 'error').mockImplementation(() => {});

describe('place search', () => {
  it('adds a place found by search, with its address and location', async () => {
    const api = stubPlacesApi([OSAKA_CASTLE, DOTONBORI]);
    const { user } = renderApp(`/trips/${trip.id}?day=2026-11-10`);
    const sheet = await openAddSheet(user);
    expect(within(sheet).getByText('검색해서 고르면 주소와 위치도 함께 저장돼요.')).toBeInTheDocument();

    await user.type(within(sheet).getByLabelText('장소 이름'), '오사카성');
    const result = await within(sheet).findByRole('button', { name: /^오사카성/ });
    expect(within(sheet).getByRole('list', { name: '검색 결과' })).toBeInTheDocument();
    expect(within(sheet).getByText('Google Maps')).toHaveAttribute('translate', 'no');
    // One request once typing pauses, around the trip's city.
    expect(api.requests).toEqual([
      expect.objectContaining({ input: '오사카성', language: 'ko', locationBias: AROUND_OSAKA }),
    ]);

    await user.click(result);
    await waitFor(() => expect(cards()).toEqual([`1오사카성${OSAKA_CASTLE.address}`]));
    // The sheet closes once saving returns, a moment after the list shows the new card.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // The list credits Google for the place data it shows.
    expect(within(screen.getByRole('tabpanel')).getByText('Google Maps')).toBeInTheDocument();

    const [item] = await repositories.schedule.listByTrip(trip.id);
    expect(item!.place).toEqual({
      placeId: OSAKA_CASTLE.placeId,
      name: '오사카성',
      address: OSAKA_CASTLE.address,
      location: OSAKA_CASTLE.location,
      fetchedAt: expect.any(String),
    });
    expect(api.fetched).toEqual([
      { placeId: OSAKA_CASTLE.placeId, fields: ['formattedAddress', 'location'] },
    ]);
  });

  it('adds a place by its name as typed, while search works too', async () => {
    const api = stubPlacesApi([OSAKA_CASTLE]);
    const { user } = renderApp(`/trips/${trip.id}?day=2026-11-10`);
    const sheet = await openAddSheet(user);
    const input = within(sheet).getByLabelText('장소 이름');

    // Enter only closes the keyboard: nothing is added until a row is tapped.
    await user.type(input, '호텔 체크인{Enter}');
    expect(input).not.toHaveFocus();
    expect(await within(sheet).findByText('검색 결과가 없어요.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '장소 추가' })).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: /^'호텔 체크인' 그대로 추가/ }));
    await waitFor(() => expect(cards()).toEqual(['1호텔 체크인']));
    const [item] = await repositories.schedule.listByTrip(trip.id);
    expect(item!.place).toEqual({ placeId: null, name: '호텔 체크인', address: null, location: null, fetchedAt: null });
    expect(api.fetched).toEqual([]);
    expect(within(screen.getByRole('tabpanel')).queryByText('Google Maps')).not.toBeInTheDocument();
  });

  it('says why there is no search without an API key, and adds by name', async () => {
    const { user } = renderApp(`/trips/${trip.id}?day=2026-11-10`);
    const sheet = await openAddSheet(user);
    expect(within(sheet).getByRole('note')).toHaveTextContent('Google Maps API 키가 없어서');

    await user.type(within(sheet).getByLabelText('장소 이름'), '오사카성{Enter}');
    await waitFor(() => expect(cards()).toEqual(['1오사카성']));
  });

  it('adds by name offline, and searches again once back online', async () => {
    const api = stubPlacesApi([OSAKA_CASTLE]);
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { user } = renderApp(`/trips/${trip.id}?day=2026-11-10`);
    const sheet = await openAddSheet(user);
    expect(within(sheet).getByRole('note')).toHaveTextContent('오프라인이라');
    await user.type(within(sheet).getByLabelText('장소 이름'), '오사카성');
    expect(within(sheet).getByRole('button', { name: '추가' })).toBeInTheDocument();

    onLine.mockReturnValue(true);
    fireEvent(window, new Event('online'));
    expect(await within(sheet).findByRole('button', { name: /^오사카성/ })).toBeInTheDocument();
    expect(within(sheet).queryByRole('note')).not.toBeInTheDocument();
    expect(api.requests).toHaveLength(1);
  });

  it('retries a failed search, and still adds by name', async () => {
    silenceErrors();
    const api = stubPlacesApi([OSAKA_CASTLE], { failSearch: true });
    const { user } = renderApp(`/trips/${trip.id}?day=2026-11-10`);
    const sheet = await openAddSheet(user);

    await user.type(within(sheet).getByLabelText('장소 이름'), '오사카성');
    expect(await within(sheet).findByText('장소를 검색하지 못했어요.')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(api.requests).toHaveLength(2));
    expect(await within(sheet).findByText('장소를 검색하지 못했어요.')).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: /그대로 추가/ }));
    await waitFor(() => expect(cards()).toEqual(['1오사카성']));
  });

  it('keeps the sheet open when the place could not be fetched', async () => {
    silenceErrors();
    stubPlacesApi([OSAKA_CASTLE], { failPick: true });
    const { user } = renderApp(`/trips/${trip.id}?day=2026-11-10`);
    const sheet = await openAddSheet(user);

    await user.type(within(sheet).getByLabelText('장소 이름'), '오사카성');
    await user.click(await within(sheet).findByRole('button', { name: /^오사카성/ }));
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('장소 정보를 불러오지 못했어요.');
    expect(within(sheet).getByRole('button', { name: /^오사카성/ })).toBeEnabled();
    expect(await repositories.schedule.listByTrip(trip.id)).toEqual([]);
  });

  it('finds the place of an item added by name, keeping its name if wanted', async () => {
    const api = stubPlacesApi([OSAKA_CASTLE]);
    await repositories.schedule.create({
      tripId: trip.id,
      date: '2026-11-10',
      place: { placeId: null, name: '성 구경', address: null, location: null, fetchedAt: null },
      memo: '입장권',
    });
    const { user } = renderApp(`/trips/${trip.id}?day=2026-11-10`);
    await user.click(await screen.findByRole('button', { name: /^성 구경(?! 순서 바꾸기)/ }));
    const editor = screen.getByRole('dialog', { name: '일정 편집' });
    expect(within(editor).getByText('주소와 위치가 없어요.')).toBeInTheDocument();
    await user.click(within(editor).getByRole('button', { name: '장소 찾기' }));

    // Searches the item's name right away.
    const finder = screen.getByRole('dialog', { name: '장소 찾기' });
    const query = within(finder).getByLabelText('장소 이름');
    expect(query).toHaveValue('성 구경');
    expect(await within(finder).findByText('검색 결과가 없어요.')).toBeInTheDocument();
    await user.clear(query);
    await user.type(query, '오사카성');
    await user.click(await within(finder).findByRole('button', { name: /^오사카성/ }));

    // Back in the editor: the found place, under its name until the old one is put back.
    expect(screen.queryByRole('dialog', { name: '장소 찾기' })).not.toBeInTheDocument();
    const name = within(editor).getByLabelText('장소 이름');
    expect(name).toHaveValue('오사카성');
    expect(within(editor).getByText(OSAKA_CASTLE.address)).toBeInTheDocument();
    await user.click(within(editor).getByRole('button', { name: '이전 이름으로' }));
    expect(name).toHaveValue('성 구경');
    await user.click(within(editor).getByRole('button', { name: '저장' }));

    await waitFor(() => expect(cards()).toEqual([`1성 구경${OSAKA_CASTLE.address}입장권`]));
    const [item] = await repositories.schedule.listByTrip(trip.id);
    expect(item!.place).toEqual({
      placeId: OSAKA_CASTLE.placeId,
      name: '성 구경',
      address: OSAKA_CASTLE.address,
      location: OSAKA_CASTLE.location,
      fetchedAt: expect.any(String),
    });
    expect(item!.memo).toBe('입장권');
    // The item had no location: search looked around the trip's city.
    expect(api.requests.at(-1)!.locationBias).toEqual(AROUND_OSAKA);
  });
});

describe('trip city search', () => {
  it("finds cities in the trip's countries, and place search then looks around the city", async () => {
    const api = stubPlacesApi([OSAKA, OSAKA_CASTLE, DOTONBORI]);
    const { user, router } = renderApp('/trips/new');
    await user.type(await screen.findByLabelText('여행 이름'), '간사이 여행');
    await user.click(screen.getByRole('button', { name: '나라 고르기' }));
    const countries = await screen.findByRole('dialog', { name: '가는 나라' });
    await user.type(within(countries).getByLabelText('나라나 도시 이름'), '일본');
    await user.click(within(countries).getByRole('checkbox', { name: '일본' }));
    await user.click(within(countries).getByRole('button', { name: '1개 나라 고르기' }));
    expect(screen.getByRole('button', { name: '일본 빼기' })).toBeInTheDocument();

    // Cities, provinces and countries only, in the countries picked.
    await user.type(screen.getByLabelText('도시'), '오사카');
    const city = await screen.findByRole('button', { name: /^오사카(?!성)/ });
    expect(api.requests[0]!.includedPrimaryTypes).toEqual(['(regions)']);
    expect(api.requests[0]!.includedRegionCodes).toEqual(['jp']);
    expect(screen.queryByRole('button', { name: /^오사카성/ })).not.toBeInTheDocument();
    await user.click(city);
    expect(await screen.findByRole('button', { name: '오사카 빼기' })).toBeInTheDocument();
    expect(screen.getByLabelText('도시')).toHaveValue('');
    expect(screen.queryByRole('list', { name: '검색 결과' })).not.toBeInTheDocument();

    await pickTripDates(user, '2026-11-10', '2026-11-10');
    await user.click(screen.getByRole('button', { name: '만들기' }));
    await waitFor(() => expect(router.state.location.pathname).not.toBe('/trips/new'));
    const created = (await repositories.trips.list()).find((t) => t.title === '간사이 여행')!;
    expect(created.countries).toEqual(['JP']);
    expect(created.cities).toEqual([FOUND_OSAKA]);

    await user.click(await screen.findByRole('button', { name: 'Day 1에 장소 추가' }));
    await user.type(screen.getByLabelText('장소 이름'), '도톤보리');
    await screen.findByRole('button', { name: /^도톤보리/ });
    expect(api.requests.at(-1)!.locationBias).toEqual(AROUND_OSAKA);
  });

  it("does not search a saved trip's cities; one is taken off, others added", async () => {
    const api = stubPlacesApi([OSAKA]);
    const typed = await repositories.trips.create({
      title: '간사이 여행',
      cities: [{ name: '간사이', placeId: null, location: null, fetchedAt: null }],
      startDate: '2026-11-10',
      endDate: '2026-11-12',
    });
    const { user } = renderApp(`/trips/${typed.id}/edit`);
    const city = await screen.findByLabelText('도시');
    expect(screen.getByText('검색해서 고르면 그 근처의 장소가 먼저 검색돼요.')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, SEARCH_DELAY_MS + 100));
    expect(api.requests).toEqual([]);

    await user.click(screen.getByRole('button', { name: '간사이 빼기' }));
    await user.type(city, '오사카');
    await user.click(await screen.findByRole('button', { name: /^오사카/ }));
    await user.type(city, '교토');
    await user.click(await screen.findByRole('button', { name: /^'교토' 그대로 넣기/ }));
    const added = within(screen.getByRole('list', { name: '넣은 도시' })).getAllByRole('listitem');
    expect(added.map((li) => li.textContent)).toEqual(['오사카', '교토']);
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(async () =>
      expect((await repositories.trips.get(typed.id))!.cities).toEqual([
        FOUND_OSAKA,
        { name: '교토', placeId: null, location: null, fetchedAt: null },
      ]),
    );
  });
});

describe("Google's place data over time", () => {
  it('refreshes week-old place data when the trip opens online, keeping the item as it is', async () => {
    const api = stubPlacesApi([OSAKA_CASTLE]);
    const weekAgo = new Date(Date.now() - 8 * 86_400_000).toISOString();
    const item = await repositories.schedule.create({
      tripId: trip.id,
      date: '2026-11-10',
      place: {
        placeId: OSAKA_CASTLE.placeId,
        name: '성 구경',
        address: '옛 주소',
        location: { lat: 34, lng: 135 },
        fetchedAt: weekAgo,
      },
      memo: '입장권',
    });
    renderApp(`/trips/${trip.id}?day=2026-11-10`);

    await waitFor(() => expect(cards()).toEqual([`1성 구경${OSAKA_CASTLE.address}입장권`]));
    expect(api.fetched).toEqual([
      { placeId: OSAKA_CASTLE.placeId, fields: ['formattedAddress', 'location'] },
    ]);
    const [after] = await repositories.schedule.listByTrip(trip.id);
    // Not an edit: the name, memo and updatedAt stay.
    expect(after).toEqual({
      ...item,
      place: {
        ...item.place,
        address: OSAKA_CASTLE.address,
        location: OSAKA_CASTLE.location,
        fetchedAt: expect.any(String),
      },
    });
    expect(Date.parse(after!.place.fetchedAt!)).toBeGreaterThan(Date.parse(weekAgo));
  });

  it('says a place whose data was removed gets it back online', async () => {
    await repositories.schedule.create({
      tripId: trip.id,
      date: '2026-11-10',
      place: { ...OSAKA_CASTLE, address: null, location: null, fetchedAt: null },
    });
    // No API key: nothing can refresh it.
    const { user } = renderApp(`/trips/${trip.id}?day=2026-11-10`);
    await user.click(await screen.findByRole('button', { name: /^오사카성(?! 순서 바꾸기)/ }));
    expect(screen.getByText('주소와 위치는 온라인일 때 다시 불러와요.')).toBeInTheDocument();
  });
});
