/** @vitest-environment happy-dom */
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { repositories } from '@/data';
import type { GeoPoint, LocalDate, Trip } from '@/data/models';
import { renderApp, resetApp, stubMapsApi } from '@/test/app';
import { makePlace, namedPlace, typedCity } from '@/test/fixtures';

vi.mock('@/data', async () => (await import('@/test/fixtures')).createTestData());

const CASTLE = { lat: 34.6873, lng: 135.5262 };
const DOTONBORI = { lat: 34.6686, lng: 135.5011 };
const UMEDA = { lat: 34.7055, lng: 135.4903 };

let trip: Trip;

beforeEach(async () => {
  await resetApp();
  trip = await repositories.trips.create({
    title: '오사카 여행',
    cities: [typedCity('오사카')],
    startDate: '2026-11-10',
    endDate: '2026-11-12',
  });
});
afterEach(() => vi.restoreAllMocks());

/**
 * Adds a place to the trip: found by search when it has a location (fetched just now, so opening
 * the trip does not refresh it), else typed by hand.
 */
async function addPlace(date: LocalDate | null, name: string, location: GeoPoint | null = null) {
  const place = location
    ? makePlace(name, { location, fetchedAt: new Date().toISOString() })
    : namedPlace(name);
  await repositories.schedule.create({ tripId: trip.id, date, place, memo: '' });
}

/** Directions for each leg, in the list between the places. */
const legLinks = () => screen.queryAllByRole('link', { name: /까지 길찾기$/ });

function goOnline(online: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
  fireEvent(window, new Event(online ? 'online' : 'offline'));
}

describe('day map', () => {
  it("shows the day's places numbered like the list, joined in order, with directions", async () => {
    await addPlace('2026-11-10', '오사카성', CASTLE);
    await addPlace('2026-11-10', '호텔 체크인');
    await addPlace('2026-11-10', '도톤보리', DOTONBORI);
    await addPlace('2026-11-10', '우메다', UMEDA);
    const api = stubMapsApi();
    renderApp(`/trips/${trip.id}?day=2026-11-10`);

    await waitFor(() =>
      expect(api.markers()).toEqual([
        ['1', '1번 오사카성'],
        ['3', '3번 도톤보리'],
        ['4', '4번 우메다'],
      ]),
    );
    expect(api.lines[0]!.path).toEqual([CASTLE, DOTONBORI, UMEDA]);
    expect(screen.getByText('2번은 위치가 없어서 지도에 없어요.')).toBeInTheDocument();

    // Under the card above each destination: past 2 (no location) it says where the leg starts.
    expect(screen.getByText('1번에서 직선 3.1km')).toBeInTheDocument();
    expect(screen.getByText('직선 4.2km')).toBeInTheDocument();
    const legs = legLinks();
    expect(legs.map((link) => link.getAttribute('aria-label'))).toEqual([
      '1번 오사카성에서 3번 도톤보리까지 길찾기',
      '3번 도톤보리에서 4번 우메다까지 길찾기',
    ]);
    const url = new URL(legs[0]!.getAttribute('href')!);
    expect(url.searchParams.get('origin_place_id')).toBe('place-오사카성');
    expect(url.searchParams.get('destination_place_id')).toBe('place-도톤보리');
    expect(legs[0]).toHaveAttribute('target', '_blank');
  });

  it('keeps one map across days and the inbox (pins without numbers), around the day without places', async () => {
    await addPlace('2026-11-10', '오사카성', CASTLE);
    await addPlace('2026-11-11', '도톤보리', DOTONBORI);
    await addPlace('2026-11-11', '우메다', UMEDA);
    await addPlace('2026-11-12', '공항 가기');
    await addPlace(null, '유니버설 스튜디오', { lat: 34.6654, lng: 135.4323 });
    const api = stubMapsApi();
    const { user } = renderApp(`/trips/${trip.id}?day=2026-11-10`);
    await waitFor(() => expect(api.markers()).toEqual([['1', '1번 오사카성']]));
    // A single place has nowhere to go.
    expect(legLinks()).toEqual([]);

    await user.click(screen.getByRole('tab', { name: /^Day 2/ }));
    await waitFor(() =>
      expect(api.markers()).toEqual([
        ['1', '1번 도톤보리'],
        ['2', '2번 우메다'],
      ]),
    );
    expect(api.maps).toHaveLength(1);
    expect(legLinks()).toHaveLength(1);

    await user.click(screen.getByRole('tab', { name: /^Day 3/ }));
    await screen.findByRole('button', { name: /^공항 가기(?! 순서 바꾸기)/ });
    // No place of Day 3 is on the map: it shows around where the trip is (Day 2 ended in 우메다).
    await waitFor(() => expect(api.maps[0]!.cameras.at(-1)).toEqual({ center: UMEDA, zoom: 11 }));
    expect(api.markers()).toEqual([]);
    expect(api.lines.at(-1)!.path).toEqual([]);
    expect(api.maps).toHaveLength(1);
    expect(screen.getByText('위치가 있는 장소를 넣으면 이 지도에 번호로 보여요.')).toBeInTheDocument();

    // The inbox's places are on a map too, as pins: no order, so no numbers and no route.
    await user.click(screen.getByRole('tab', { name: /^보관함/ }));
    await waitFor(() => expect(api.markers()).toEqual([['', '유니버설 스튜디오']]));
    expect(api.lines.at(-1)!.path).toEqual([]);
    expect(legLinks()).toEqual([]);
  });

  it('shows around the first city before any place, and nothing at all without a key', async () => {
    const taipei = { lat: 25.033, lng: 121.5654 };
    const withCity = await repositories.trips.create({
      title: '타이베이 여행',
      cities: [{ name: '타이베이', placeId: 'place-taipei', location: taipei, fetchedAt: new Date().toISOString() }],
      startDate: '2026-11-28',
      endDate: '2026-11-30',
    });
    renderApp(`/trips/${withCity.id}?day=2026-11-28`);
    expect(await screen.findByText('아직 일정이 없어요')).toBeInTheDocument();
    // Without a key, no note about the map on a day that has no places anyway.
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    cleanup();

    const api = stubMapsApi();
    const { user } = renderApp(`/trips/${withCity.id}?day=2026-11-29`);
    await waitFor(() => expect(api.maps[0]?.cameras.at(-1)).toEqual({ center: taipei, zoom: 11 }));
    expect(api.markers()).toEqual([]);
    expect(screen.getByText('장소를 넣으면 이 지도에 번호로 보여요.')).toBeInTheDocument();

    // The inbox has no "where": no map while it is empty.
    await user.click(screen.getByRole('tab', { name: /^보관함/ }));
    await waitFor(() => expect(screen.queryByText(/이 지도에/)).not.toBeInTheDocument());
  });

  it('says why there is no map without an API key, and still gives directions', async () => {
    await addPlace('2026-11-10', '오사카성', CASTLE);
    await addPlace('2026-11-10', '도톤보리', DOTONBORI);
    renderApp(`/trips/${trip.id}?day=2026-11-10`);

    expect(await screen.findByRole('note')).toHaveTextContent(
      'Google Maps API 키가 없어서 지도를 볼 수 없어요.',
    );
    expect(legLinks()).toHaveLength(1);
  });

  it('loads the map once back online, and keeps it when the connection drops', async () => {
    await addPlace('2026-11-10', '오사카성', CASTLE);
    const api = stubMapsApi();
    goOnline(false);
    renderApp(`/trips/${trip.id}?day=2026-11-10`);
    expect(await screen.findByRole('note')).toHaveTextContent('오프라인이라 지도를 볼 수 없어요.');
    expect(api.maps).toEqual([]);

    goOnline(true);
    await waitFor(() => expect(api.markers()).toEqual([['1', '1번 오사카성']]));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();

    goOnline(false);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(api.markers()).toEqual([['1', '1번 오사카성']]);
  });

  it('tries again after the map fails to load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await addPlace('2026-11-10', '오사카성', CASTLE);
    const api = stubMapsApi();
    const maps = (globalThis as unknown as { google: { maps: typeof google.maps } }).google.maps;
    vi.spyOn(maps, 'importLibrary').mockRejectedValueOnce(new Error('could not load'));
    const { user } = renderApp(`/trips/${trip.id}?day=2026-11-10`);

    expect(await screen.findByText('지도를 불러오지 못했어요.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다시 시도' }));

    await waitFor(() => expect(api.markers()).toEqual([['1', '1번 오사카성']]));
    expect(screen.queryByText('지도를 불러오지 못했어요.')).not.toBeInTheDocument();
  });

  it('follows changes to the day', async () => {
    await addPlace('2026-11-10', '오사카성', CASTLE);
    await addPlace('2026-11-10', '도톤보리', DOTONBORI);
    const api = stubMapsApi();
    const { user } = renderApp(`/trips/${trip.id}?day=2026-11-10`);
    await waitFor(() => expect(api.markers()).toHaveLength(2));

    await user.click(screen.getByRole('button', { name: /^오사카성(?! 순서 바꾸기)/ }));
    await user.click(screen.getByRole('button', { name: '일정 삭제' }));
    await user.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() => expect(api.markers()).toEqual([['1', '1번 도톤보리']]));
    expect(legLinks()).toEqual([]);
  });
});
