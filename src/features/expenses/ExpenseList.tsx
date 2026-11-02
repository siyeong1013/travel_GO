import { Link } from 'react-router';
import { MapPinIcon } from '@/components/ui/icons';
import type { Companion, CurrencyCode, ID, ScheduleItem } from '@/data/models';
import {
  CATEGORY_ICONS,
  type ExpenseRow,
  type ExpenseSection,
  expenseTitle,
  PAYMENT_LABELS,
  splitSummary,
} from '@/features/expenses/expenseDisplay';
import { formatDate, formatMoney } from '@/lib/format';

interface ExpenseListProps {
  tripId: ID;
  sections: ExpenseSection[];
  currency: CurrencyCode;
  companions: Companion[];
  scheduleItems: ScheduleItem[];
}

/** Expenses by trip day (and before/after the trip), each day with its total. */
export function ExpenseList({ tripId, sections, currency, companions, scheduleItems }: ExpenseListProps) {
  return (
    <div className="flex flex-col pb-4">
      {sections.map((section) => (
        <section key={section.key} aria-label={section.title}>
          <div className="flex items-baseline justify-between gap-3 px-4 pt-5 pb-1">
            <h2 className="text-[15px] font-bold">
              {section.title}
              {section.subtitle && (
                <span className="font-medium text-gray-500"> {section.subtitle}</span>
              )}
            </h2>
            <p className="text-sm font-semibold text-gray-600 tabular-nums">
              <span className="sr-only">합계 </span>
              {formatMoney(section.total, currency)}
            </p>
          </div>
          <ul className="px-1">
            {section.rows.map((row) => (
              <li key={row.expense.id}>
                <ExpenseRowLink
                  tripId={tripId}
                  row={row}
                  currency={currency}
                  showDate={section.subtitle === null}
                  companions={companions}
                  scheduleItems={scheduleItems}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

interface ExpenseRowLinkProps {
  tripId: ID;
  row: ExpenseRow;
  currency: CurrencyCode;
  /** Before/after the trip, where the section doesn't say the day. */
  showDate: boolean;
  companions: Companion[];
  scheduleItems: ScheduleItem[];
}

function ExpenseRowLink({
  tripId,
  row: { expense, converted },
  currency,
  showDate,
  companions,
  scheduleItems,
}: ExpenseRowLinkProps) {
  const payer = companions.find((c) => c.id === expense.payerId)?.name ?? '?';
  const place = scheduleItems.find((item) => item.id === expense.scheduleItemId)?.place.name;
  const meta = [
    showDate && formatDate(expense.date),
    `${payer} 결제`,
    splitSummary(expense, companions),
    PAYMENT_LABELS[expense.paymentMethod],
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Link
      to={`/trips/${tripId}/expenses/${expense.id}`}
      className="flex items-center gap-3 rounded-2xl px-3 py-2.5 active:bg-gray-50"
    >
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-xl"
      >
        {CATEGORY_ICONS[expense.category]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{expenseTitle(expense)}</span>
        <span className="block truncate text-sm text-gray-500">{meta}</span>
        {place && (
          <span className="mt-0.5 flex items-center gap-1 text-sm text-gray-500">
            <MapPinIcon width={13} height={13} className="shrink-0 text-gray-400" />
            <span className="truncate">{place}</span>
          </span>
        )}
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-semibold tabular-nums">
          {formatMoney(expense.amount, expense.currency)}
        </span>
        {expense.currency !== currency &&
          (converted === null ? (
            <span className="block text-xs font-semibold text-red-500">환율 확인 필요</span>
          ) : (
            <span className="block text-sm text-gray-500 tabular-nums">
              ≈ {formatMoney(converted, currency)}
            </span>
          ))}
      </span>
    </Link>
  );
}
