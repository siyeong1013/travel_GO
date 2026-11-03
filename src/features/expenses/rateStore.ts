import { createStore, useStore } from 'zustand';
import type { CurrencyCode } from '@/data/models';
import { type Clock, nowIso } from '@/lib/dates';
import {
  exchangeRateApi,
  type ExchangeRateApi,
  isFresh,
  type LatestRates,
} from '@/lib/exchangeRateApi';

export interface RateState {
  /** API rates by base currency, as last received (from the network or this device's cache). */
  latest: Partial<Record<CurrencyCode, LatestRates>>;
  /**
   * The latest API rates for `base`. Fresh ones (see `isFresh`) are reused instead of asking
   * again, which keeps requests within the provider's terms. Null when offline or the request
   * fails. Concurrent calls share one request.
   */
  fetchLatest: (base: CurrencyCode) => Promise<LatestRates | null>;
}

export function createRateStore(api: ExchangeRateApi, now: Clock = nowIso) {
  const inflight = new Map<CurrencyCode, Promise<LatestRates | null>>();

  return createStore<RateState>()((set, get) => {
    const keep = (rates: LatestRates) =>
      set((state) => ({ latest: { ...state.latest, [rates.base]: rates } }));

    return {
      latest: {},

      fetchLatest(base) {
        const at = now();
        const held = get().latest[base];
        const kept = held && isFresh(held, at) ? held : api.readCache(base);
        if (kept && isFresh(kept, at)) {
          if (kept !== held) keep(kept);
          return Promise.resolve(kept);
        }

        const pending = inflight.get(base);
        if (pending) return pending;
        const promise = api
          .fetchLatest(base)
          .then(
            (rates) => {
              keep(rates);
              api.writeCache(rates);
              return rates;
            },
            // Offline or unavailable: the form falls back to the last rate used, or typing one.
            () => null,
          )
          .finally(() => inflight.delete(base));
        inflight.set(base, promise);
        return promise;
      },
    };
  });
}

export const rateStore = createRateStore(exchangeRateApi);

export function useRateStore<T>(selector: (state: RateState) => T): T {
  return useStore(rateStore, selector);
}
