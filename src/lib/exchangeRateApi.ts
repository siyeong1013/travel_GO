import type { CurrencyCode, ISODateTime } from '@/data/models';
import { CURRENCY_CODES, isCurrency, isRate } from '@/data/rules/money';
import { type Clock, isIsoDateTime, nowIso } from '@/lib/dates';

// open.er-api.com: free, no key, CORS enabled, updated once a day. Its terms allow caching, ask
// for no more than hourly requests (429 for 20 minutes otherwise) and for this attribution link.
const ENDPOINT = 'https://open.er-api.com/v6/latest/';

export const RATE_ATTRIBUTION = {
  text: 'Rates By Exchange Rate API',
  url: 'https://www.exchangerate-api.com',
} as const;

const HOUR_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 8000;
const CACHE_KEY = 'travel-go:latest-rates';

/** One day's rates from the API: 1 `base` = `rates[code]` × `code`. */
export interface LatestRates {
  base: CurrencyCode;
  /** Decimal strings (see `isRate`), for the supported currencies other than `base`. */
  rates: Partial<Record<CurrencyCode, string>>;
  /** When the provider published them. */
  updatedAt: ISODateTime;
  /** When it publishes the next ones. */
  nextUpdateAt: ISODateTime;
  /** When this device received them. */
  receivedAt: ISODateTime;
}

/**
 * Still worth using instead of asking again: until the provider's next update, and for at least
 * an hour after receiving them (in case that update is late).
 */
export function isFresh(rates: LatestRates, now: ISODateTime): boolean {
  const at = Date.parse(now);
  const received = Date.parse(rates.receivedAt);
  if (received > at) return false; // the device clock went back
  return at < Math.max(Date.parse(rates.nextUpdateAt), received + HOUR_MS);
}

/**
 * An API rate (a float with up to 6 decimals) as a decimal string `isRate` accepts: at most
 * 10 significant digits and 10 decimals, without trailing zeros. Null unless positive.
 */
export function rateText(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  const decimals = Math.min(10, Math.max(0, 9 - Math.floor(Math.log10(value))));
  const fixed = value.toFixed(decimals);
  const text = fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
  return isRate(text) ? text : null;
}

function unixToIso(value: unknown): ISODateTime | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 8.64e12
    ? new Date(value * 1000).toISOString()
    : null;
}

/** The API's JSON for `base`, or null unless it is a success response for that base. */
export function parseLatestRates(
  body: unknown,
  base: CurrencyCode,
  receivedAt: ISODateTime,
): LatestRates | null {
  if (typeof body !== 'object' || body === null) return null;
  const { result, base_code, rates, time_last_update_unix, time_next_update_unix } = body as Record<
    string,
    unknown
  >;
  if (result !== 'success' || base_code !== base) return null;
  if (typeof rates !== 'object' || rates === null) return null;
  const updatedAt = unixToIso(time_last_update_unix);
  const nextUpdateAt = unixToIso(time_next_update_unix);
  if (!updatedAt || !nextUpdateAt) return null;

  const parsed: Partial<Record<CurrencyCode, string>> = {};
  for (const code of CURRENCY_CODES) {
    const text = code === base ? null : rateText((rates as Record<string, unknown>)[code]);
    if (text) parsed[code] = text;
  }
  return { base, rates: parsed, updatedAt, nextUpdateAt, receivedAt };
}

/** Cached entries are untrusted (other app versions, edits): checked like any input. */
function isCachedRates(value: unknown, base: CurrencyCode): value is LatestRates {
  if (typeof value !== 'object' || value === null) return false;
  const { base: cachedBase, rates, updatedAt, nextUpdateAt, receivedAt } = value as Record<
    string,
    unknown
  >;
  return (
    cachedBase === base &&
    typeof rates === 'object' &&
    rates !== null &&
    Object.entries(rates).every(([code, rate]) => isCurrency(code) && isRate(rate)) &&
    [updatedAt, nextUpdateAt, receivedAt].every(isIsoDateTime)
  );
}

export interface ExchangeRateApi {
  /** Throws when offline, on network or HTTP errors, on timeouts and unexpected responses. */
  fetchLatest(base: CurrencyCode): Promise<LatestRates>;
  /** Rates kept on this device from an earlier visit (any age), or null. */
  readCache(base: CurrencyCode): LatestRates | null;
  writeCache(rates: LatestRates): void;
}

interface ExchangeRateApiOptions {
  fetch?: typeof fetch;
  /** Where rates are kept between visits; undefined when unavailable (Node, blocked storage). */
  storage?: () => Storage | undefined;
  now?: Clock;
  timeoutMs?: number;
}

function deviceStorage(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined; // reading it throws when site data is blocked
  }
}

export function createExchangeRateApi({
  // Looked up on each call, so tests can stub the global.
  fetch: request = (input, init) => fetch(input, init),
  storage = deviceStorage,
  now = nowIso,
  timeoutMs = TIMEOUT_MS,
}: ExchangeRateApiOptions = {}): ExchangeRateApi {
  function readAll(): Record<string, unknown> {
    try {
      const all: unknown = JSON.parse(storage()?.getItem(CACHE_KEY) ?? '{}');
      return typeof all === 'object' && all !== null ? (all as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  return {
    async fetchLatest(base) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new Error('offline');
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await request(`${ENDPOINT}${base}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`exchange rate API: HTTP ${response.status}`);
        const rates = parseLatestRates(await response.json(), base, now());
        if (!rates) throw new Error(`exchange rate API: unexpected response for ${base}`);
        return rates;
      } finally {
        clearTimeout(timer);
      }
    },

    readCache(base) {
      const cached = readAll()[base];
      return isCachedRates(cached, base) ? cached : null;
    },

    writeCache(rates) {
      try {
        storage()?.setItem(CACHE_KEY, JSON.stringify({ ...readAll(), [rates.base]: rates }));
      } catch {
        // Full or blocked: the rates just aren't kept for next time.
      }
    },
  };
}

export const exchangeRateApi = createExchangeRateApi();
