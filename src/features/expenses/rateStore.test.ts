import { describe, expect, it, vi } from 'vitest';
import { createRateStore } from '@/features/expenses/rateStore';
import { type ExchangeRateApi, type LatestRates, parseLatestRates } from '@/lib/exchangeRateApi';
import { latestRatesBody } from '@/test/fixtures';

const yen = (receivedAt: string): LatestRates =>
  parseLatestRates(latestRatesBody('JPY', { KRW: 8.510259 }), 'JPY', receivedAt)!;

/** An API that answers from `responses` in turn, with a device cache in memory. */
function fakeApi(...responses: (LatestRates | Error)[]) {
  const cache = new Map<string, LatestRates>();
  const api = {
    fetchLatest: vi.fn(async () => {
      const next = responses.shift();
      if (!next || next instanceof Error) throw next ?? new Error('no response');
      return next;
    }),
    readCache: (base: string) => cache.get(base) ?? null,
    writeCache: (rates: LatestRates) => void cache.set(rates.base, rates),
  } satisfies ExchangeRateApi;
  return { api, cache };
}

function setup(api: ExchangeRateApi, start = '2026-11-03T01:00:00.000Z') {
  let now = start;
  const store = createRateStore(api, () => now);
  return { store, setNow: (at: string) => (now = at) };
}

describe('rateStore', () => {
  it('asks once, then reuses the rates until the next update', async () => {
    const { api, cache } = fakeApi(yen('2026-11-03T01:00:00.000Z'), yen('2026-11-04T01:00:00.000Z'));
    const { store, setNow } = setup(api);

    const [first, second] = await Promise.all([
      store.getState().fetchLatest('JPY'),
      store.getState().fetchLatest('JPY'),
    ]);
    expect(first).toBe(second);
    expect(first?.rates.KRW).toBe('8.51');
    expect(store.getState().latest.JPY).toBe(first);
    expect(cache.get('JPY')).toBe(first);

    setNow('2026-11-03T20:00:00.000Z');
    expect(await store.getState().fetchLatest('JPY')).toBe(first);
    expect(api.fetchLatest).toHaveBeenCalledTimes(1);

    setNow('2026-11-04T01:00:00.000Z'); // after the provider's next update
    expect((await store.getState().fetchLatest('JPY'))?.receivedAt).toBe('2026-11-04T01:00:00.000Z');
    expect(api.fetchLatest).toHaveBeenCalledTimes(2);
  });

  it('starts from rates kept on the device', async () => {
    const { api, cache } = fakeApi();
    cache.set('JPY', yen('2026-11-03T00:30:00.000Z'));
    const { store } = setup(api);

    expect(await store.getState().fetchLatest('JPY')).toBe(cache.get('JPY'));
    expect(store.getState().latest.JPY).toBe(cache.get('JPY'));
    expect(api.fetchLatest).not.toHaveBeenCalled();
  });

  it('answers null when offline, and asks again next time', async () => {
    const { api } = fakeApi(new Error('offline'), yen('2026-11-03T01:00:00.000Z'));
    const { store } = setup(api);

    expect(await store.getState().fetchLatest('JPY')).toBeNull();
    expect(store.getState().latest).toEqual({});
    expect(await store.getState().fetchLatest('JPY')).not.toBeNull();
  });

  it('does not use stale rates, even from the device', async () => {
    const { api, cache } = fakeApi(new Error('offline'));
    cache.set('JPY', yen('2026-11-01T01:00:00.000Z'));
    const { store } = setup(api, '2026-11-04T09:00:00.000Z');

    expect(await store.getState().fetchLatest('JPY')).toBeNull();
    expect(api.fetchLatest).toHaveBeenCalledTimes(1);
  });
});
