import { type MouseEvent, useId } from 'react';
import { Link } from 'react-router';
import { buttonClass } from '@/components/ui/buttonClass';
import { PlusIcon } from '@/components/ui/icons';
import type { ScheduleItem, Trip } from '@/data/models';
import { itemExpenses } from '@/features/expenses/expenseDisplay';
import { ExpenseRowLink } from '@/features/expenses/ExpenseList';
import { useExpenses } from '@/features/expenses/useExpenses';
import { formatMoney } from '@/lib/format';

interface ItemExpensesProps {
  trip: Trip;
  item: ScheduleItem;
  /** Opens an expense screen at `path` (instead of the links themselves, to save edits first). */
  onOpen: (path: string) => void;
}

/** In a schedule item's sheet: what was spent there (each opens its form) and adding to it. */
export function ItemExpenses({ trip, item, onOpen }: ItemExpensesProps) {
  const { expenses, companions } = useExpenses(trip.id);
  const titleId = useId();
  const { rows, total } = itemExpenses(trip, expenses, item.id);
  const addPath = `/trips/${trip.id}/expenses/new?item=${item.id}`;
  const open = (path: string) => (event: MouseEvent) => {
    event.preventDefault();
    onOpen(path);
  };

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-1.5">
      <div className="flex min-h-5 items-center justify-between gap-3">
        <h3 id={titleId} className="text-sm font-semibold text-gray-700">
          지출
        </h3>
        {rows.length > 0 && (
          <p className="text-sm font-semibold text-gray-500 tabular-nums">
            합계 {formatMoney(total, trip.settlementCurrency)}
          </p>
        )}
      </div>
      {rows.length > 0 ? (
        <ul className="-mx-3">
          {rows.map((row) => (
            <li key={row.expense.id}>
              <ExpenseRowLink
                tripId={trip.id}
                row={row}
                currency={trip.settlementCurrency}
                showDate={row.expense.date !== item.date}
                companions={companions}
                onClick={open(`/trips/${trip.id}/expenses/${row.expense.id}`)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">이 일정에 연결된 지출이 없어요.</p>
      )}
      <Link to={addPath} onClick={open(addPath)} className={buttonClass('secondary', true)}>
        <PlusIcon width={18} height={18} />
        지출 추가
      </Link>
    </section>
  );
}
