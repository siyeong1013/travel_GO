import type { CurrencyCode } from '@/data/models';

/**
 * Supported currencies and their minor-unit digits (ISO 4217). Stored amounts are read with
 * these digits: add currencies freely, but never change an existing entry's digits.
 */
export const CURRENCIES = {
  KRW: { digits: 0, label: '원', symbol: '₩' },
  JPY: { digits: 0, label: '엔', symbol: '¥' },
  USD: { digits: 2, label: '미국 달러', symbol: '$' },
  EUR: { digits: 2, label: '유로', symbol: '€' },
  CNY: { digits: 2, label: '위안', symbol: 'CN¥' },
  TWD: { digits: 2, label: '대만 달러', symbol: 'NT$' },
  HKD: { digits: 2, label: '홍콩 달러', symbol: 'HK$' },
  THB: { digits: 2, label: '바트', symbol: '฿' },
  VND: { digits: 0, label: '동', symbol: '₫' },
  SGD: { digits: 2, label: '싱가포르 달러', symbol: 'S$' },
  PHP: { digits: 2, label: '필리핀 페소', symbol: '₱' },
  GBP: { digits: 2, label: '파운드', symbol: '£' },
  AUD: { digits: 2, label: '호주 달러', symbol: 'A$' },
} as const satisfies Record<string, { digits: number; label: string; symbol: string }>;

export const DEFAULT_SETTLEMENT_CURRENCY: CurrencyCode = 'KRW';

/** Largest accepted amount in minor units; keeps every intermediate product exact. */
export const MAX_AMOUNT = 1_000_000_000_000;

export function isCurrency(code: unknown): code is CurrencyCode {
  return typeof code === 'string' && Object.hasOwn(CURRENCIES, code);
}

/** Supported codes in table order (for pickers). */
export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

/** Digits, Korean name (`엔`, `미국 달러`) and symbol (`¥`, `$`). */
export function currencyInfo(code: CurrencyCode): { digits: number; label: string; symbol: string } {
  if (!isCurrency(code)) throw new Error(`unsupported currency: ${code}`);
  return CURRENCIES[code as keyof typeof CURRENCIES];
}

export function currencyDigits(code: CurrencyCode): number {
  return currencyInfo(code).digits;
}

/** A positive whole number of minor units, within `MAX_AMOUNT`. */
export function isAmount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= MAX_AMOUNT;
}

/** `"1,234.5"` → minor units of `currency`, zero allowed; null unless valid and ≤ `MAX_AMOUNT`. */
export function parseMinorUnits(text: string, currency: CurrencyCode): number | null {
  const match = /^(\d+)(?:\.(\d*))?$/.exec(text.replace(/[,\s]/g, ''));
  if (!match) return null;
  const digits = currencyDigits(currency);
  const fraction = match[2] ?? '';
  if (fraction.length > digits) return null;
  const minor = Number(match[1] + fraction.padEnd(digits, '0'));
  return Number.isSafeInteger(minor) && minor <= MAX_AMOUNT ? minor : null;
}

/** `"1,234.5"` → minor units of `currency`; null unless it is a valid positive amount. */
export function parseAmount(text: string, currency: CurrencyCode): number | null {
  const minor = parseMinorUnits(text, currency);
  return minor !== null && isAmount(minor) ? minor : null;
}

/** Minor units → plain decimal text that `parseAmount` reads back: 1234 USD → `"12.34"`. */
export function toDecimalString(amount: number, currency: CurrencyCode): string {
  const digits = currencyDigits(currency);
  const sign = amount < 0 ? '-' : '';
  const text = String(Math.abs(amount)).padStart(digits + 1, '0');
  return digits === 0
    ? `${sign}${text}`
    : `${sign}${text.slice(0, -digits)}.${text.slice(-digits)}`;
}

const RATE_RE = /^(\d{1,12})(?:\.(\d{1,10}))?$/;

/** A positive decimal string with at most 10 decimals, e.g. `"9.0412"`. */
export function isRate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = RATE_RE.exec(value);
  return match !== null && /[1-9]/.test(match[1]! + (match[2] ?? ''));
}

/** Significant digits kept in a rate under 1 (`0.05271`), where 2 decimals would say little. */
const SMALL_RATE_DIGITS = 4;

/**
 * `rate` as people read it, rounded half up: 2 decimals from 1 up (`1379.22`, `8.50`), else
 * 4 significant digits without trailing zeros (`0.05271`). A rate that would round to 0 stays.
 */
export function roundRate(rate: string): string {
  const match = RATE_RE.exec(rate);
  if (!match || !isRate(rate)) throw new Error(`invalid rate: ${rate}`);
  const whole = match[1]!.replace(/^0+(?=\d)/, '');
  const fraction = match[2] ?? '';
  const small = whole === '0';
  const firstDigit = fraction.search(/[1-9]/);
  const decimals = small ? Math.min(10, firstDigit + SMALL_RATE_DIGITS) : 2;
  // One digit past the kept ones decides the rounding.
  const scaled = BigInt(whole + fraction.padEnd(decimals + 1, '0').slice(0, decimals + 1));
  const rounded = (scaled + 5n) / 10n;
  if (rounded === 0n) return rate;
  const unit = 10n ** BigInt(decimals);
  const text = `${rounded / unit}.${(rounded % unit).toString().padStart(decimals, '0')}`;
  if (!small) return text;
  return rounded >= unit ? roundRate(text) : text.replace(/0+$/, '');
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
