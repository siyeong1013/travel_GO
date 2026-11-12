import { createStore, useStore } from 'zustand';
import { keySpot } from '@/features/schedule/weather';
import { type Clock, nowIso } from '@/lib/dates';
import {
  isFresh,
  isKept,
  type SpotForecast,
  weatherApi,
  type WeatherApi,
  WeatherRefusedError,
} from '@/lib/weatherApi';

/** A spot whose request failed (not refused) is asked again after this. */
const RETRY_MS = 10 * 60 * 1000;

export interface WeatherState {
  /** Forecasts by spot (`spotKey`): received, or kept on this device (24 hours at most). */
  forecasts: Record<string, SpotForecast>;
  /** When a spot's last request failed (ms), so a failing spot isn't asked on every visit. */
  failedAt: Record<string, number>;
  /**
   * No more requests: the API refused the key (not allowed for it yet), until the app opens again.
   */
  stopped: boolean;
  /**
   * Forecasts for these spots: kept ones while fresh, else asked when online (one request per
   * spot at a time). Forecasts past the terms' 24 hours are let go, even offline.
   */
  load: (keys: string[]) => Promise<void>;
}

export function createWeatherStore(api: WeatherApi, now: Clock = nowIso) {
  const inflight = new Map<string, Promise<void>>();

  return createStore<WeatherState>()((set, get) => {
    function ask(key: string): Promise<void> {
      const pending = inflight.get(key);
      if (pending) return pending;
      const promise = api
        .fetchForecast(key, keySpot(key))
        .then(
          (forecast) => {
            set((state) => ({ forecasts: { ...state.forecasts, [key]: forecast } }));
            api.writeCache(forecast);
          },
          (error: unknown) => {
            if (error instanceof WeatherRefusedError) {
              // Most likely the key doesn't allow the Weather API yet (Cloud console).
              console.warn('[travel GO] weather API refused the key:', error.message);
              set({ stopped: true });
            } else {
              set((state) => ({ failedAt: { ...state.failedAt, [key]: Date.parse(now()) } }));
            }
          },
        )
        .finally(() => inflight.delete(key));
      inflight.set(key, promise);
      return promise;
    }

    return {
      forecasts: {},
      failedAt: {},
      stopped: false,

      load(keys) {
        const at = now();
        const held = get().forecasts;
        const forecasts = Object.fromEntries(
          Object.entries(held).filter(([, forecast]) => isKept(forecast, at)),
        );
        for (const key of keys) {
          const kept = api.readCache(key);
          if (!kept || !isKept(kept, at)) continue;
          if (!forecasts[key] || kept.receivedAt > forecasts[key].receivedAt) {
            forecasts[key] = kept;
          }
        }
        const changed =
          Object.keys(forecasts).length !== Object.keys(held).length ||
          Object.entries(forecasts).some(([key, forecast]) => held[key] !== forecast);
        if (changed) set({ forecasts });

        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        if (get().stopped || offline) return Promise.resolve();
        const { failedAt } = get();
        const stale = keys.filter((key) => {
          const forecast = forecasts[key];
          if (forecast && isFresh(forecast, at)) return false;
          return Date.parse(at) - (failedAt[key] ?? -Infinity) >= RETRY_MS;
        });
        return Promise.all(stale.map(ask)).then(() => undefined);
      },
    };
  });
}

export const weatherStore = createWeatherStore(weatherApi);

export function useWeatherStore<T>(selector: (state: WeatherState) => T): T {
  return useStore(weatherStore, selector);
}
