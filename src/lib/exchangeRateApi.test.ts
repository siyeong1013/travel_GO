import { describe, expect, it, vi } from 'vitest';
import {
  createExchangeRateApi,
  isFresh,
  type LatestRates,
  parseLatestRates,
  rateText,
} from '@/lib/exchangeRateApi';
import { latestRatesBody, RATES_PUBLISHED_AT } from '@/test/fixtures';

const RECEIVED = '2026-11-03T01:00:00.000Z';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('rateText', () => {
  it('keeps the digits the API sends, without float noise or exponents', () => {
    expect(rateText(8.510259)).toBe('8.510259');
    expect(rateText(1344.12576)).toBe('1344.12576');
    expect(rateText(0.1 + 0.2)).toBe('0.3');
    expect(rateText(3.9e-5)).toBe('0.000039'); // JSON may spell small rates as 3.9e-05
    expect(rateText(25743.911696)).toBe('25743.9117'); // 10 significant digits
    expect(rateText(1)).toBe('1');
    expect(rateText(1000)).toBe('1000');
  });

  it('refuses what is not a positive rate', () => {
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1e-12, 1e13, '9.04', null]) {
      expect(rateText(value), String(value)).toBeNull();
    }
  });
});

describe('parseLatestRates', () => {
  it('reads the supported currencies of a success response', () => {
    const body = latestRatesBody('JPY', { KRW: 8.510259, USD: 0.006333, AED: 0.023259, EUR: -1 });
    expect(parseLatestRates(body, 'JPY', RECEIVED)).toEqual({
      base: 'JPY',
      rates: { KRW: '8.510259', USD: '0.006333' },
      updatedAt: RATES_PUBLISHED_AT,
      nextUpdateAt: '2026-11-04T00:10:21.000Z',
      receivedAt: RECEIVED,
    });
  });

  it('rejects errors, other bases and missing fields', () => {
    const ok = latestRatesBody('JPY', { KRW: 8.5 });
    for (const body of [
      { result: 'error', 'error-type': 'unsupported-code' },
      latestRatesBody('USD', { KRW: 1344 }),
      { ...ok, rates: null },
      { ...ok, time_next_update_unix: undefined },
      'success',
      null,
    ]) {
      expect(parseLatestRates(body, 'JPY', RECEIVED), JSON.stringify(body)).toBeNull();
    }
  });
});

describe('isFresh', () => {
  const rates = parseLatestRates(latestRatesBody('JPY', { KRW: 8.5 }), 'JPY', RECEIVED)!;

  it('lasts until the next update, and at least an hour', () => {
    expect(isFresh(rates, '2026-11-03T23:59:00.000Z')).toBe(true);
    expect(isFresh(rates, '2026-11-04T00:10:21.000Z')).toBe(false);
    const late = { ...rates, receivedAt: '2026-11-04T00:30:00.000Z' }; // the update is late
    expect(isFresh(late, '2026-11-04T01:00:00.000Z')).toBe(true);
    expect(isFresh(late, '2026-11-04T01:30:00.000Z')).toBe(false);
  });

  it('is stale when the device clock went back', () => {
    expect(isFresh(rates, '2026-11-02T00:00:00.000Z')).toBe(false);
  });
});

describe('createExchangeRateApi', () => {
  it('asks for the base currency and stamps when it arrived', async () => {
    const fetch = vi.fn(async () => jsonResponse(latestRatesBody('JPY', { KRW: 8.510259 })));
    const api = createExchangeRateApi({ fetch, storage: () => undefined, now: () => RECEIVED });

    expect(await api.fetchLatest('JPY')).toMatchObject({
      rates: { KRW: '8.510259' },
      receivedAt: RECEIVED,
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://open.er-api.com/v6/latest/JPY',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('throws on HTTP errors, error responses and network failures', async () => {
    const responses = [
      () => jsonResponse({ result: 'error' }, 429),
      () => jsonResponse({ result: 'error', 'error-type': 'unsupported-code' }),
      () => new Response('<html>', { status: 200 }),
      () => Promise.reject(new TypeError('Failed to fetch')),
    ];
    for (const respond of responses) {
      const api = createExchangeRateApi({ fetch: async () => respond(), storage: () => undefined });
      await expect(api.fetchLatest('JPY')).rejects.toThrow();
    }
  });

  it('gives up after the timeout', async () => {
    const fetch = (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
      );
    const api = createExchangeRateApi({ fetch, storage: () => undefined, timeoutMs: 10 });
    await expect(api.fetchLatest('JPY')).rejects.toThrow('aborted');
  });

  it('keeps rates per base on the device, ignoring entries it cannot read', () => {
    const storage = memoryStorage();
    const api = createExchangeRateApi({ storage: () => storage });
    const yen = parseLatestRates(latestRatesBody('JPY', { KRW: 8.5 }), 'JPY', RECEIVED)!;
    const dollar: LatestRates = { ...yen, base: 'USD', rates: { KRW: '1344.12576' } };

    api.writeCache(yen);
    api.writeCache(dollar);
    expect(api.readCache('JPY')).toEqual(yen);
    expect(api.readCache('USD')).toEqual(dollar);
    expect(api.readCache('EUR')).toBeNull();

    storage.setItem('travel-go:latest-rates', JSON.stringify({ JPY: { ...yen, rates: { KRW: 'x' } } }));
    expect(api.readCache('JPY')).toBeNull();
    storage.setItem('travel-go:latest-rates', '{not json');
    expect(api.readCache('JPY')).toBeNull();

    const nowhere = createExchangeRateApi({ storage: () => undefined });
    nowhere.writeCache(yen);
    expect(nowhere.readCache('JPY')).toBeNull();
  });
});
