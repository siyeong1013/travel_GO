import { describe, expect, it, vi } from 'vitest';
import { createWeatherStore } from '@/features/schedule/weatherStore';
import {
  parseForecast,
  type SpotForecast,
  type WeatherApi,
  WeatherRefusedError,
} from '@/lib/weatherApi';
import { forecastBody } from '@/test/fixtures';

const KEY = '41.0,29.0';
/** `hours` after the start. */
const T = (hours: number) =>
  new Date(Date.parse('2026-11-10T00:00:00.000Z') + hours * 3_600_000).toISOString();
const CLEAR = forecastBody([{ date: '2026-11-10', type: 'CLEAR', text: '맑음', max: 18, min: 9 }]);
const forecastAt = (at: string): SpotForecast => parseForecast(CLEAR, KEY, at)!;

function fakeApi(fetchForecast: WeatherApi['fetchForecast']) {
  const kept = new Map<string, SpotForecast>();
  const api: WeatherApi = {
    fetchForecast: vi.fn(fetchForecast),
    readCache: (key) => kept.get(key) ?? null,
    writeCache: (forecast) => void kept.set(forecast.key, forecast),
  };
  return { api, kept };
}

describe('weather store', () => {
  it('asks once per spot however many ask at once, and uses a fresh one as is', async () => {
    let now = T(0);
    const { api } = fakeApi(async (key) => ({ ...forecastAt(now), key }));
    const store = createWeatherStore(api, () => now);

    await Promise.all([store.getState().load([KEY]), store.getState().load([KEY])]);
    expect(api.fetchForecast).toHaveBeenCalledTimes(1);
    expect(store.getState().forecasts[KEY]?.days[0]?.description).toBe('맑음');

    now = T(2);
    await store.getState().load([KEY]);
    expect(api.fetchForecast).toHaveBeenCalledTimes(1);
    now = T(3.5); // no longer fresh
    await store.getState().load([KEY]);
    expect(api.fetchForecast).toHaveBeenCalledTimes(2);
  });

  it('waits ten minutes before asking for a spot that failed, and stops when refused', async () => {
    let now = T(0);
    let answer: () => Promise<SpotForecast> = () => Promise.reject(new Error('HTTP 500'));
    const { api } = fakeApi(() => answer());
    const store = createWeatherStore(api, () => now);

    await store.getState().load([KEY]);
    now = T(0.1);
    await store.getState().load([KEY]);
    expect(api.fetchForecast).toHaveBeenCalledTimes(1);
    now = T(0.2);
    answer = () => Promise.reject(new WeatherRefusedError(403));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await store.getState().load([KEY, '38.6,34.8']);
    expect(store.getState().stopped).toBe(true);
    const asked = vi.mocked(api.fetchForecast).mock.calls.length;
    now = T(1);
    await store.getState().load(['37.6,127.0']);
    expect(api.fetchForecast).toHaveBeenCalledTimes(asked);
  });

  it("lets forecasts go after the terms' 24 hours, even offline", async () => {
    let now = T(0);
    const { api } = fakeApi(async () => forecastAt(now));
    const store = createWeatherStore(api, () => now);
    await store.getState().load([KEY]);
    expect(store.getState().forecasts[KEY]).toBeDefined();

    vi.stubGlobal('navigator', { onLine: false });
    now = T(25);
    await store.getState().load([KEY]);
    expect(store.getState().forecasts[KEY]).toBeUndefined();
  });
});
