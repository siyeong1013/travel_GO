import type { CurrencyCode } from '@/data/models';

/**
 * Supported currencies and their minor-unit digits (ISO 4217). Stored amounts are read with
 * these digits: add currencies freely, but never change an existing entry's digits.
 */
export const CURRENCIES = {
  KRW: { digits: 0, label: '원' },
  JPY: { digits: 0, label: '엔' },
  USD: { digits: 2, label: '미국 달러' },
  EUR: { digits: 2, label: '유로' },
  CNY: { digits: 2, label: '위안' },
  TWD: { digits: 2, label: '대만 달러' },
  HKD: { digits: 2, label: '홍콩 달러' },
  THB: { digits: 2, label: '바트' },
  VND: { digits: 0, label: '동' },
  SGD: { digits: 2, label: '싱가포르 달러' },
  PHP: { digits: 2, label: '필리핀 페소' },
  GBP: { digits: 2, label: '파운드' },
  AUD: { digits: 2, label: '호주 달러' },
} as const satisfies Record<string, { digits: number; label: string }>;

export const DEFAULT_SETTLEMENT_CURRENCY: CurrencyCode = 'KRW';

/** Largest accepted amount in minor units; keeps every intermediate product exact. */
export const MAX_AMOUNT = 1_000_000_000_000;

export function isCurrency(code: unknown): code is CurrencyCode {
  return typeof code === 'string' && Object.hasOwn(CURRENCIES, code);
}

export function currencyDigits(code: CurrencyCode): number {
  if (!isCurrency(code)) throw new Error(`unsupported currency: ${code}`);
  return CURRENCIES[code as keyof typeof CURRENCIES].digits;
}

/** A positive whole number of minor units, within `MAX_AMOUNT`. */
export function isAmount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= MAX_AMOUNT;
}

/** `"1,234.5"` → minor units of `currency`; null unless it is a valid positive amount. */
export function parseAmount(text: string, currency: CurrencyCode): number | null {
  const match = /^(\d+)(?:\.(\d*))?$/.exec(text.replace(/[,\s]/g, ''));
  if (!match) return null;
  const digits = currencyDigits(currency);
  const fraction = match[2] ?? '';
  if (fraction.length > digits) return null;
  const minor = Number(match[1] + fraction.padEnd(digits, '0'));
  return isAmount(minor) ? minor : null;
}

const RATE_RE = /^(\d{1,12})(?:\.(\d{1,10}))?$/;

/** A positive decimal string with at most 10 decimals, e.g. `"9.0412"`. */
export function isRate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = RATE_RE.exec(value);
  return match !== null && /[1-9]/.test(match[1]! + (match[2] ?? ''));
}

/**
 * `amount` (minor units of `from`) × `rate` → minor units of `to`, rounded half up once.
 * Exact integer arithmetic; `rate` is how many `to` one `from` is worth.
 */
export function convertAmount(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  rate: string,
): number {
  if (from === to) return amount;
  const match = RATE_RE.exec(rate);
  if (!match || !isRate(rate)) throw new Error(`invalid rate: ${rate}`);
  const fraction = match[2] ?? '';
  const rateValue = BigInt(match[1]! + fraction);
  const numerator = BigInt(amount) * rateValue * 10n ** BigInt(currencyDigits(to));
  const denominator = 10n ** BigInt(currencyDigits(from) + fraction.length);
  return Number((2n * numerator + denominator) / (2n * denominator));
}
