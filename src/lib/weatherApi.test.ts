import { describe, expect, it, vi } from 'vitest';
import {
  createWeatherApi,
  isFresh,
  isKept,
  parseForecast,
  type SpotForecast,
  WeatherRefusedError,
} from '@/lib/weatherApi';
import { forecastBody } from '@/test/fixtures';

const NOW = '2026-11-10T00:00:00.000Z';
const KEY = '41.0,29.0';

const body = forecastBody(
  [
    { date: '2026-11-10', type: 'PARTLY_CLOUDY', text: '구름 조금', max: 13.3, min: 1.5, rain: 5 },
    { date: '2026-11-11', type: 'LIGHT_RAIN', text: '약한 비', max: 15.9, min: 11.2, rain: 75 },
  ],
  'Europe/Istanbul',
);

/** Storage in memory, as localStorage would be. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}

describe('weather API', () => {
  it("reads the daytime's weather, the high and the low of each day", () => {
    expect(parseForecast(body, KEY, NOW)).toEqual({
      key: KEY,
      timeZone: 'Europe/Istanbul',
      receivedAt: NOW,
      days: [
        {
          date: '2026-11-10',
          condition: 'PARTLY_CLOUDY',
          description: '구름 조금',
          max: 13,
          min: 2,
          precipitation: { percent: 5, type: 'RAIN' },
        },
        {
          date: '2026-11-11',
          condition: 'LIGHT_RAIN',
          description: '약한 비',
          max: 16,
          min: 11,
          precipitation: { percent: 75, type: 'RAIN' },
        },
      ],
    });
    expect(parseForecast({ forecastDays: [] }, KEY, NOW)).toBeNull();
    // Japan and South Korea: the whole day's part, no daytime one.
    const day = { date: '2026-11-10', type: 'CLOUDY_WITH_PERIODIC_RAIN', text: '흐리고 때때로 비' };
    const osaka = forecastBody([{ ...day, max: 14, min: 13, rain: 70 }], 'Asia/Tokyo');
    expect(osaka.forecastDays[0]).not.toHaveProperty('daytimeForecast');
    expect(parseForecast(osaka, KEY, NOW)?.days[0]).toMatchObject({
      condition: 'CLOUDY_WITH_PERIODIC_RAIN',
      description: '흐리고 때때로 비',
      precipitation: { percent: 70, type: 'RAIN' },
    });
    expect(parseForecast({ error: { code: 403 } }, KEY, NOW)).toBeNull();
  });

  it('asks for ten days in one page, in Korean and °C, with the map key', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(body));
    const api = createWeatherApi({ fetch, storage: memoryStorage, now: () => NOW });

    const forecast = await api.fetchForecast(KEY, { lat: 41, lng: 29 });
    expect(forecast.days).toHaveLength(2);
    const url = new URL(String(fetch.mock.calls[0]![0]));
    expect(`${url.origin}${url.pathname}`).toBe(
      'https://weather.googleapis.com/v1/forecast/days:lookup',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      key: 'test-key',
      'location.latitude': '41',
      'location.longitude': '29',
      days: '10',
      pageSize: '10',
      languageCode: 'ko',
      unitsSystem: 'METRIC',
    });
  });

  it('tells a refusal (the key may not use the API) from other failures', async () => {
    const refusing = createWeatherApi({
      fetch: async () => Response.json({ error: { status: 'PERMISSION_DENIED' } }, { status: 403 }),
    });
    await expect(refusing.fetchForecast(KEY, { lat: 41, lng: 29 })).rejects.toBeInstanceOf(
      WeatherRefusedError,
    );
    const failing = createWeatherApi({ fetch: async () => new Response('', { status: 500 }) });
    const error = await failing.fetchForecast(KEY, { lat: 41, lng: 29 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(WeatherRefusedError);
  });

  it('keeps forecasts on the device for 24 hours at most, as the terms allow', () => {
    let now = NOW;
    const storage = memoryStorage();
    const api = createWeatherApi({ storage: () => storage, now: () => now });
    const forecast = parseForecast(body, KEY, NOW)!;
    api.writeCache(forecast);
    expect(api.readCache(KEY)).toEqual(forecast);

    now = '2026-11-10T03:30:00.000Z';
    expect(isFresh(forecast, now)).toBe(false); // asked again after 3 hours
    expect(api.readCache(KEY)).toEqual(forecast); // still shown meanwhile (offline)

    now = '2026-11-11T00:00:01.000Z';
    expect(isKept(forecast, now)).toBe(false);
    expect(api.readCache(KEY)).toBeNull();
    // Writing another drops the old one from the device.
    const other: SpotForecast = { ...forecast, key: '38.6,34.8', receivedAt: now };
    api.writeCache(other);
    expect(Object.keys(JSON.parse(storage.getItem('travel-go:weather')!) as object)).toEqual([
      '38.6,34.8',
    ]);
  });
});
