/** @vitest-environment happy-dom */
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { repositories } from '@/data';
import type { GeoPoint, LocalDate, Trip } from '@/data/models';
import { addDays, toLocalDate } from '@/lib/dates';
import { renderApp, resetApp, stubMapsApi, stubWeatherApi } from '@/test/app';
import { forecastBody, makePlace, typedCity } from '@/test/fixtures';

vi.mock('@/data', async () => (await import('@/test/fixtures')).createTestData());

const ISTANBUL = { lat: 41.0369, lng: 28.9858 };
const GOREME = { lat: 38.6431, lng: 34.8289 };
const OSAKA = { lat: 34.6873, lng: 135.5262 };

/** The forecast reaches ten days from today: the trips here start today. */
const today = toLocalDate();
const day = (n: number) => addDays(today, n);

let trip: Trip;

beforeEach(async () => {
  await resetApp();
  trip = await repositories.trips.create({
    title: '튀르키예',
    cities: [typedCity('이스탄불')],
    startDate: day(0),
    endDate: day(3),
  });
});

/** A place found by search, fetched just now (opening the trip doesn't refresh it). */
async function addPlace(tripId: string, date: LocalDate, name: string, location: GeoPoint) {
  const place = makePlace(name, { location, fetchedAt: new Date().toISOString() });
  await repositories.schedule.create({ tripId, date, place, memo: '' });
}

/** Istanbul's and Göreme's weather (by the spot asked about), from today. */
function answerForecasts(url: URL) {
  const istanbul = Number(url.searchParams.get('location.latitude')) > 40;
  const days = [0, 1, 2, 3].map((n) =>
    istanbul
      ? { date: day(n), type: 'PARTLY_CLOUDY', text: '구름 조금', max: 13.3, min: 1.5, rain: 5 }
      : { date: day(n), type: 'LIGHT_SNOW', text: '약한 눈', max: 2, min: -6, rain: 60 },
  );
  // Snow in Göreme: what falls is said.
  if (!istanbul) return forecastBody(days.map((d) => ({ ...d, falls: 'SNOW' })), 'Europe/Istanbul');
  return forecastBody(days, 'Europe/Istanbul');
}

const weatherLine = () => screen.queryByText(/Source: Includes weather data from Google\./);

describe('weather', () => {
  it('shows each day its weather where it is, under the tabs too, with Google named', async () => {
    await addPlace(trip.id, day(0), '탁심광장', ISTANBUL);
    await addPlace(trip.id, day(2), '괴레메 동굴 호텔', GOREME);
    stubMapsApi();
    const fetch = stubWeatherApi(answerForecasts);
    const { user } = renderApp(`/trips/${trip.id}?day=${day(0)}`);

    // Day 1 in Istanbul; Day 2 still there; Day 3 ends in Göreme, Day 4 too.
    const first = await screen.findByRole('tab', { name: /^Day 1.*구름 조금, 최고 13도/ });
    expect(first).toHaveTextContent('13°');
    expect(screen.getByRole('tab', { name: /^Day 2.*구름 조금/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Day 3.*약한 눈, 최고 2도/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Day 4.*약한 눈/ })).toBeInTheDocument();
    expect(screen.getByText('구름 조금 · 2° / 13°')).toBeInTheDocument();
    expect(weatherLine()).toBeInTheDocument();
    // One request for each city: the places of a city share a spot.
    expect(fetch).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('tab', { name: /^Day 3/ }));
    expect(await screen.findByText('약한 눈 · -6° / 2° · 눈 60%')).toBeInTheDocument();
    // The inbox has no weather of its own; Google is still named next to the tabs.
    await user.click(screen.getByRole('tab', { name: /^보관함/ }));
    await waitFor(() => expect(screen.queryByText(/약한 눈 ·/)).not.toBeInTheDocument());
    expect(weatherLine()).toBeInTheDocument();
  });

  it("names Weathernews for Japan's weather, as the terms ask", async () => {
    await addPlace(trip.id, day(0), '오사카성', OSAKA);
    stubMapsApi();
    stubWeatherApi(() =>
      forecastBody([{ date: day(0), type: 'CLEAR', text: '맑음', max: 18, min: 9 }], 'Asia/Tokyo'),
    );
    renderApp(`/trips/${trip.id}?day=${day(0)}`);

    expect(await screen.findByText('気象データ提供： 株式会社ウェザーニューズ')).toBeInTheDocument();
    expect(screen.getByText('맑음 · 9° / 18°')).toBeInTheDocument();
  });

  it('asks nothing for a trip the forecast cannot reach yet, nor without a map key', async () => {
    const later = await repositories.trips.create({
      title: '방콕',
      cities: [typedCity('방콕')],
      startDate: day(30),
      endDate: day(33),
    });
    await addPlace(later.id, day(30), '왕궁', { lat: 13.75, lng: 100.49 });
    stubMapsApi();
    const fetch = stubWeatherApi(answerForecasts);
    renderApp(`/trips/${later.id}?day=${day(30)}`);
    await screen.findByRole('button', { name: /^왕궁/ });
    expect(fetch).not.toHaveBeenCalled();
    expect(weatherLine()).not.toBeInTheDocument();
  });

  it('shows nothing when the key may not use the Weather API, and stops asking', async () => {
    await addPlace(trip.id, day(0), '탁심광장', ISTANBUL);
    await addPlace(trip.id, day(2), '괴레메 동굴 호텔', GOREME);
    stubMapsApi();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetch = stubWeatherApi(() =>
      Response.json({ error: { code: 403, status: 'PERMISSION_DENIED' } }, { status: 403 }),
    );
    const { user } = renderApp(`/trips/${trip.id}?day=${day(0)}`);

    await waitFor(() => expect(warn).toHaveBeenCalled());
    await user.click(screen.getByRole('tab', { name: /^Day 3/ }));
    expect(weatherLine()).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Day 1/ })).not.toHaveTextContent('°');
    // Both cities were asked at once; nothing after the refusal.
    expect(fetch.mock.calls.length).toBeLessThanOrEqual(2);
    const asked = fetch.mock.calls.length;
    await user.click(screen.getByRole('tab', { name: /^Day 1/ }));
    expect(fetch).toHaveBeenCalledTimes(asked);
  });
});
