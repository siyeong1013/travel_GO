import type { LocalDate, ScheduleItem, Trip } from '@/data/models';
import { eachDateInRange, isDateInRange, isLocalDate } from '@/lib/dates';
import { formatDate } from '@/lib/format';

export const INBOX = 'inbox';

/** A day of the trip (`YYYY-MM-DD`) or the inbox. Also the `day` URL param. */
export type GroupKey = LocalDate | typeof INBOX;

export const keyOf = (date: LocalDate | null): GroupKey => date ?? INBOX;
export const dateOf = (key: GroupKey): LocalDate | null => (key === INBOX ? null : key);

/** DOM id of a day tab, for `aria-labelledby` and focus moves. */
export const tabElementId = (idPrefix: string, key: GroupKey) => `${idPrefix}-tab-${key}`;

export interface DayTab {
  key: GroupKey;
  date: LocalDate | null;
  /** `Day 1`, or `보관함`. */
  title: string;
  /** `11.10 (화)`; null for the inbox. */
  subtitle: string | null;
  count: number;
}

type TripDates = Pick<Trip, 'startDate' | 'endDate'>;

/** One tab per day of the trip, then the inbox. */
export function buildDayTabs(trip: TripDates, items: ScheduleItem[]): DayTab[] {
  const counts = new Map<LocalDate | null, number>();
  for (const item of items) counts.set(item.date, (counts.get(item.date) ?? 0) + 1);

  return [
    ...eachDateInRange(trip.startDate, trip.endDate).map((date, i) => ({
      key: date,
      date,
      title: `Day ${i + 1}`,
      subtitle: formatDate(date),
      count: counts.get(date) ?? 0,
    })),
    { key: INBOX, date: null, title: '보관함', subtitle: null, count: counts.get(null) ?? 0 },
  ];
}

/** `Day 1 · 11.10 (화)`, or `보관함`. */
export function tabLabel(tab: DayTab): string {
  return tab.subtitle ? `${tab.title} · ${tab.subtitle}` : tab.title;
}

/** The `day` URL param if it names a tab of this trip; otherwise today during the trip, else Day 1. */
export function resolveDayKey(param: string | null, trip: TripDates, today: LocalDate): GroupKey {
  if (param === INBOX) return INBOX;
  if (isLocalDate(param) && isDateInRange(param, trip.startDate, trip.endDate)) return param;
  return isDateInRange(today, trip.startDate, trip.endDate) ? today : trip.startDate;
}
