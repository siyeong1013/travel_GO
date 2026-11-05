import type { ISODateTime } from '@/data/models';
import { compareIsoDateTime } from '@/lib/dates';

/** A country code as the map uses it: ISO 3166-1 alpha-2 (`JP`). */
export function isCountryCode(code: unknown): code is string {
  return typeof code === 'string' && /^[A-Z]{2}$/.test(code);
}

/**
 * When a change to a country made at `now` is stamped: after the version this device has, even
 * if its clock is behind, so the change it made on top of that version wins (as in data/sync).
 */
export function countryStamp(now: ISODateTime, current: ISODateTime | undefined): ISODateTime {
  if (!current || compareIsoDateTime(now, current) > 0) return now;
  return new Date(Date.parse(current) + 1).toISOString();
}
