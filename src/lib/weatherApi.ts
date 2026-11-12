import type { GeoPoint, ISODateTime, LocalDate } from '@/data/models';
import { type Clock, isIsoDateTime, isLocalDate, nowIso } from '@/lib/dates';
import { deviceStorage } from '@/lib/deviceStorage';
import { googleMapsApiKey } from '@/lib/googleMaps';

// Google's Weather API (Google Maps Platform), with the map's key: the key must allow it, as it
// does the Maps JavaScript and Places APIs. One request is a spot's daily forecast for up to ten
// days from its today, billed as one event (10,000 free a month). Its terms let daily forecasts
// be kept 24 hours, and ask for an attribution next to them (`weatherAttributions`).
const ENDPOINT = 'https://weather.googleapis.com/v1/forecast/days:lookup';
export const FORECAST_DAYS = 10;

const HOUR_MS = 60 * 60 * 1000;
/** Asked again after this: forecasts change through the day. */
const FRESH_MS = 3 * HOUR_MS;
/** The terms' limit for daily forecasts: deleted after this. */
const KEEP_MS = 24 * HOUR_MS;
const TIMEOUT_MS = 8000;
const CACHE_KEY = 'travel-go:weather';

/**
 * A day's forecast at a spot: the daytime's (when the places are visited), or the whole day's in
 * Japan and South Korea, where the API has no daytime part.
 */
export interface DayForecast {
  date: LocalDate;
  /** As the API types it: `CLEAR`, `LIGHT_RAIN`, … (see `weatherIconKind`). */
  condition: string;
  /** In Korean, from the API: `대체로 맑음`. */
  description: string;
  /** °C, rounded; null when the API doesn't say. */
  max: number | null;
  min: number | null;
  /** Daytime chance (0–100) of what falls: `RAIN`, `SNOW`, `RAIN_AND_SNOW`. */
  precipitation: { percent: number; type: string } | null;
}

export interface SpotForecast {
  /** The spot asked about, as `spotKey` writes it. */
  key: string;
  days: DayForecast[];
  /** Where the spot is (`Asia/Tokyo`): Japan and South Korea need their own attribution. */
  timeZone: string | null;
  /** When this device received it. */
  receivedAt: ISODateTime;
}

/** The API refused the request (key not allowed for it, or the API not enabled): no use asking. */
export class WeatherRefusedError extends Error {
  constructor(readonly status: number) {
    super(`weather API: HTTP ${status}`);
    this.name = 'WeatherRefusedError';
  }
}

/** Still worth showing instead of asking again. */
export function isFresh(forecast: SpotForecast, now: ISODateTime): boolean {
  const age = Date.parse(now) - Date.parse(forecast.receivedAt);
  return age >= 0 && age < FRESH_MS;
}

/** Still allowed on this device by the terms (shown while offline, until asked again). */
export function isKept(forecast: SpotForecast, now: ISODateTime): boolean {
  const age = Date.parse(now) - Date.parse(forecast.receivedAt);
  return age >= 0 && age < KEEP_MS;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function degrees(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const { degrees: amount } = value;
  return typeof amount === 'number' && Number.isFinite(amount) ? Math.round(amount) : null;
}

function localDate(value: unknown): LocalDate | null {
  if (!isRecord(value)) return null;
  const { year, month, day } = value;
  if (![year, month, day].every((part) => typeof part === 'number')) return null;
  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isLocalDate(date) ? date : null;
}

function dayForecast(value: unknown): DayForecast | null {
  if (!isRecord(value)) return null;
  const date = localDate(value.displayDate);
  // Japan and South Korea (Weathernews's data) have the whole day only.
  const [daytime = {}] = [value.daytimeForecast, value.fullDayForecast].filter(
    (part): part is Record<string, unknown> => isRecord(part) && isRecord(part.weatherCondition),
  );
  const condition = isRecord(daytime.weatherCondition) ? daytime.weatherCondition : {};
  const description = isRecord(condition.description) ? condition.description.text : null;
  if (!date || typeof condition.type !== 'string') return null;

  const precipitation = isRecord(daytime.precipitation) ? daytime.precipitation.probability : null;
  const percent = isRecord(precipitation) ? precipitation.percent : null;
  return {
    date,
    condition: condition.type,
    description: typeof description === 'string' ? description : '',
    max: degrees(value.maxTemperature),
    min: degrees(value.minTemperature),
    precipitation:
      isRecord(precipitation) && typeof percent === 'number' && percent >= 0 && percent <= 100
        ? {
            percent: Math.round(percent),
            type: typeof precipitation.type === 'string' ? precipitation.type : 'RAIN',
          }
        : null,
  };
}

/** The API's JSON for the spot `key`, or null unless it holds at least one day. */
export function parseForecast(
  body: unknown,
  key: string,
  receivedAt: ISODateTime,
): SpotForecast | null {
  if (!isRecord(body) || !Array.isArray(body.forecastDays)) return null;
  const days = body.forecastDays.flatMap((day) => dayForecast(day) ?? []);
  if (days.length === 0) return null;
  const zone = isRecord(body.timeZone) ? body.timeZone.id : null;
  return { key, days, timeZone: typeof zone === 'string' ? zone : null, receivedAt };
}

/** Kept entries are untrusted (other app versions, edits): checked like any input. */
function isKeptForecast(value: unknown, key: string): value is SpotForecast {
  if (!isRecord(value) || value.key !== key || !isIsoDateTime(value.receivedAt)) return false;
  return (
    Array.isArray(value.days) &&
    value.days.every((day) => isRecord(day) && isLocalDate(day.date)) &&
    (value.timeZone === null || typeof value.timeZone === 'string')
  );
}

export interface WeatherApi {
  /**
   * The daily forecast at `spot` (its `key`). Throws `WeatherRefusedError` when the key may not
   * use the API, and on other errors: offline, network, HTTP, timeouts, unexpected responses.
   */
  fetchForecast(key: string, spot: GeoPoint): Promise<SpotForecast>;
  /** The forecast kept on this device for `key`, while the terms allow it (24 hours); or null. */
  readCache(key: string): SpotForecast | null;
  /** Keeps a forecast, and deletes the ones kept past the terms' limit. */
  writeCache(forecast: SpotForecast): void;
}

interface WeatherApiOptions {
  fetch?: typeof fetch;
  /** Where forecasts are kept between visits; undefined when unavailable (Node, blocked). */
  storage?: () => Storage | undefined;
  now?: Clock;
  timeoutMs?: number;
}

export function createWeatherApi({
  // Looked up on each call, so tests can stub the global.
  fetch: request = (input, init) => fetch(input, init),
  storage = deviceStorage,
  now = nowIso,
  timeoutMs = TIMEOUT_MS,
}: WeatherApiOptions = {}): WeatherApi {
  /** The kept forecasts, those past the limit left out. */
  function readAll(): Record<string, SpotForecast> {
    let all: unknown;
    try {
      all = JSON.parse(storage()?.getItem(CACHE_KEY) ?? '{}');
    } catch {
      return {};
    }
    if (!isRecord(all)) return {};
    const at = now();
    return Object.fromEntries(
      Object.entries(all).filter(
        (entry): entry is [string, SpotForecast] =>
          isKeptForecast(entry[1], entry[0]) && isKept(entry[1], at),
      ),
    );
  }

  return {
    async fetchForecast(key, { lat, lng }) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new Error('offline');
      }
      const params = new URLSearchParams({
        key: googleMapsApiKey(),
        'location.latitude': String(lat),
        'location.longitude': String(lng),
        days: String(FORECAST_DAYS),
        pageSize: String(FORECAST_DAYS),
        languageCode: 'ko',
        unitsSystem: 'METRIC',
      });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await request(`${ENDPOINT}?${params}`, { signal: controller.signal });
        if (response.status === 401 || response.status === 403) {
          throw new WeatherRefusedError(response.status);
        }
        if (!response.ok) throw new Error(`weather API: HTTP ${response.status}`);
        const forecast = parseForecast(await response.json(), key, now());
        if (!forecast) throw new Error(`weather API: unexpected response for ${key}`);
        return forecast;
      } finally {
        clearTimeout(timer);
      }
    },

    readCache(key) {
      return readAll()[key] ?? null;
    },

    writeCache(forecast) {
      try {
        storage()?.setItem(CACHE_KEY, JSON.stringify({ ...readAll(), [forecast.key]: forecast }));
      } catch {
        // Full or blocked: the forecast just isn't kept for next time.
      }
    },
  };
}

export const weatherApi = createWeatherApi();
