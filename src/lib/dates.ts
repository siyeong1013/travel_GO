import type { ISODateTime, LocalDate, LocalTime } from '@/data/models';

const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export type Clock = () => ISODateTime;

export const nowIso: Clock = () => new Date().toISOString();

export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string') return false;
  const match = LOCAL_DATE_RE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function isLocalTime(value: unknown): value is LocalTime {
  return typeof value === 'string' && LOCAL_TIME_RE.test(value);
}

export function isIsoDateTime(value: unknown): value is ISODateTime {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

/** Positive when `a` is later than `b`. */
export function compareIsoDateTime(a: ISODateTime, b: ISODateTime): number {
  return Date.parse(a) - Date.parse(b);
}

// LocalDate arithmetic runs on UTC midnights so DST changes never shift a day.
const toUtcMs = (date: LocalDate) => Date.parse(`${date}T00:00:00Z`);
const fromUtcMs = (ms: number): LocalDate => new Date(ms).toISOString().slice(0, 10);

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function diffDays(from: LocalDate, to: LocalDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

/** Every date from `start` to `end`, both inclusive. Empty if `end` is before `start`. */
export function eachDateInRange(start: LocalDate, end: LocalDate): LocalDate[] {
  const count = diffDays(start, end) + 1;
  return Array.from({ length: Math.max(count, 0) }, (_, i) => addDays(start, i));
}

export function isDateInRange(date: LocalDate, start: LocalDate, end: LocalDate): boolean {
  return date >= start && date <= end;
}

/** The device's local calendar date. */
export function toLocalDate(date: Date = new Date()): LocalDate {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
