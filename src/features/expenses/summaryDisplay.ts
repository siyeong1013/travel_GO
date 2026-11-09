import type { ExpenseCategory, Trip } from '@/data/models';
import { EXPENSE_CATEGORIES } from '@/data/rules/expense';
import type { Ledger } from '@/data/rules/ledger';
import { type DayHeading, dayHeading } from '@/features/expenses/expenseDisplay';
import { eachDateInRange } from '@/lib/dates';

export interface CategoryRow {
  category: ExpenseCategory;
  total: number;
  /** Of all spending, 0–1. */
  share: number;
}

/** Categories with spending, largest first (ties in the usual category order). */
export function categoryRows({ total, byCategory }: Pick<Ledger, 'total' | 'byCategory'>): CategoryRow[] {
  return EXPENSE_CATEGORIES.filter((category) => byCategory[category] > 0)
    .map((category) => ({ category, total: byCategory[category], share: byCategory[category] / total }))
    .sort((a, b) => b.total - a.total);
}

/** `49%`, or `1% 미만` for a sliver that would round to nothing. */
export function formatShare(share: number): string {
  const percent = Math.round(share * 100);
  return percent === 0 && share > 0 ? '1% 미만' : `${percent}%`;
}

export interface DayRow extends DayHeading {
  total: number;
}

/** Every trip day, spent on or not; before and after the trip only when there is spending. */
export function dayRows(
  trip: Pick<Trip, 'startDate' | 'endDate'>,
  byDate: Ledger['byDate'],
): DayRow[] {
  const totals = new Map(byDate.map(({ date, total }) => [date, total]));
  const outside = (dates: Ledger['byDate']): DayRow[] =>
    dates.length === 0
      ? []
      : [{ ...dayHeading(trip, dates[0]!.date), total: dates.reduce((sum, d) => sum + d.total, 0) }];

  return [
    ...outside(byDate.filter(({ date }) => date < trip.startDate)),
    ...eachDateInRange(trip.startDate, trip.endDate).map((date) => ({
      ...dayHeading(trip, date),
      total: totals.get(date) ?? 0,
    })),
    ...outside(byDate.filter(({ date }) => date > trip.endDate)),
  ];
}
