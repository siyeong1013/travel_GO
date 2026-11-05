// A month calendar for picking dates (components/ui/DateRangeSheet), on `YYYY-MM-DD` strings like
// the rest of the app (lib/dates): no time zones.
import type { LocalDate } from '@/data/models';
import { weekday } from '@/lib/format';

/** `YYYY-MM`. */
export type YearMonth = string;

export const monthOf = (date: LocalDate): YearMonth => date.slice(0, 7);

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** The month `count` months after `month` (before it when negative). */
export function addMonths(month: YearMonth, count: number): YearMonth {
  const [year, number] = month.split('-').map(Number) as [number, number];
  const total = year * 12 + number - 1 + count;
  return `${pad(Math.floor(total / 12), 4)}-${pad((total % 12) + 1)}`;
}

/** The months from `from` to `to`, both in. */
export function monthsBetween(from: YearMonth, to: YearMonth): YearMonth[] {
  const months: YearMonth[] = [];
  for (let month = from; month <= to; month = addMonths(month, 1)) months.push(month);
  return months;
}

/** A month's days in weeks that start on Sunday; null where a week runs into the months around. */
export function monthWeeks(month: YearMonth): (LocalDate | null)[][] {
  const [year, number] = month.split('-').map(Number) as [number, number];
  const lead = new Date(Date.UTC(year, number - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const cells: (LocalDate | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => `${month}-${pad(i + 1)}`),
  ];
  while (cells.length % 7 > 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7));
}

/** `2026년 12월`. */
export function monthTitle(month: YearMonth): string {
  const [year, number] = month.split('-').map(Number) as [number, number];
  return `${year}년 ${number}월`;
}

/** `2026년 12월 1일 화요일`: what a day is called to a screen reader. */
export function dayName(date: LocalDate): string {
  const [year, number, day] = date.split('-').map(Number) as [number, number, number];
  return `${year}년 ${number}월 ${day}일 ${weekday(date)}요일`;
}

/** Dates being picked: the start first, then the end. */
export interface DatePick {
  start: LocalDate | null;
  end: LocalDate | null;
}

/**
 * Where a tap on `date` leaves the pick: the end when it is on or after the start still waiting for
 * one (the start itself: a day trip); otherwise a new start.
 */
export function tapDate(pick: DatePick, date: LocalDate): DatePick {
  if (pick.start === null || pick.end !== null || date < pick.start) return { start: date, end: null };
  return { start: pick.start, end: date };
}
