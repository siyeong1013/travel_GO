import type { ISODateTime, LocalDate, Trip, VisitedCountry } from '@/data/models';
import { compareIsoDateTime, toLocalDate } from '@/lib/dates';

/** A country code as the map uses it: ISO 3166-1 alpha-2 (`JP`). */
export function isCountryCode(code: unknown): code is string {
  return typeof code === 'string' && /^[A-Z]{2}$/.test(code);
}

/** A region of a country (state, province, prefecture): ISO 3166-2 (`JP-27`). */
export function isRegionCode(code: unknown): code is string {
  return typeof code === 'string' && /^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(code);
}

/** What "다녀온 나라" keeps a mark for: a country, or a region of one. */
export function isPlaceCode(code: unknown): code is string {
  return isCountryCode(code) || isRegionCode(code);
}

/**
 * When a change to a country made at `now` is stamped: after the version this device has, even
 * if its clock is behind, so the change it made on top of that version wins (as in data/sync).
 */
export function countryStamp(now: ISODateTime, current: ISODateTime | undefined): ISODateTime {
  if (!current || compareIsoDateTime(now, current) > 0) return now;
  return new Date(Date.parse(current) + 1).toISOString();
}

/**
 * The countries of trips begun by `today` to put on the map ("다녀온 나라"): each one not on it,
 * unless it was taken off since the latest of those trips began (the person's word stands).
 * `dateOf` is the device's day of a moment.
 */
export function tripCountriesToMark(
  trips: Pick<Trip, 'countries' | 'startDate'>[],
  marks: VisitedCountry[],
  today: LocalDate,
  dateOf: (at: ISODateTime) => LocalDate = (at) => toLocalDate(new Date(at)),
): string[] {
  // Each country's latest begun trip.
  const begun = new Map<string, LocalDate>();
  for (const trip of trips) {
    if (trip.startDate > today) continue;
    for (const code of trip.countries) {
      const start = begun.get(code);
      if (!start || trip.startDate > start) begun.set(code, trip.startDate);
    }
  }
  const byCode = new Map(marks.map((mark) => [mark.id, mark]));
  return [...begun].flatMap(([code, start]) => {
    const mark = byCode.get(code);
    if (mark?.visited || (mark && dateOf(mark.updatedAt) >= start)) return [];
    return [code];
  });
}
