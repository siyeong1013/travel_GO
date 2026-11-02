import type { LocalDate } from '@/data/models';
import { diffDays } from '@/lib/dates';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function parts(date: LocalDate) {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

export function weekday(date: LocalDate): string {
  const { year, month, day } = parts(date);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]!;
}

/** `11.10 (화)`, or `2027.1.3 (일)` with the year. */
export function formatDate(date: LocalDate, withYear = false): string {
  const { year, month, day } = parts(date);
  return `${withYear ? `${year}.` : ''}${month}.${day} (${weekday(date)})`;
}

/** Shows a year only where it differs from the one before it (this year, then the start). */
export function formatDateRange(start: LocalDate, end: LocalDate, today: LocalDate): string {
  const startText = formatDate(start, start.slice(0, 4) !== today.slice(0, 4));
  if (start === end) return startText;
  return `${startText} – ${formatDate(end, end.slice(0, 4) !== start.slice(0, 4))}`;
}

/** `2박 3일`, or `당일치기` for a single day. */
export function formatTripLength(start: LocalDate, end: LocalDate): string {
  const nights = diffDays(start, end);
  return nights === 0 ? '당일치기' : `${nights}박 ${nights + 1}일`;
}
