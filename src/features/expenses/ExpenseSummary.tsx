import { type ReactNode, useId, useState } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Companion, ExpenseWithShares, Settlement, Trip } from '@/data/models';
import { buildLedger } from '@/data/rules/ledger';
import { BudgetBar } from '@/features/expenses/BudgetBar';
import { BudgetSheet } from '@/features/expenses/BudgetSheet';
import {
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  expenseTitle,
  usesApiRates,
} from '@/features/expenses/expenseDisplay';
import { RateAttribution } from '@/features/expenses/RateAttribution';
import {
  budgetStatus,
  categoryRows,
  dayRows,
  formatShare,
} from '@/features/expenses/summaryDisplay';
import { formatDate, formatMoney } from '@/lib/format';

interface ExpenseSummaryProps {
  trip: Trip;
  companions: Companion[];
  expenses: ExpenseWithShares[];
  settlements: Settlement[];
}

/** The budget, then spending by category, by day and by person, in the settlement currency. */
export function ExpenseSummary({ trip, companions, expenses, settlements }: ExpenseSummaryProps) {
  const [editingBudget, setEditingBudget] = useState(false);
  const ledger = buildLedger(trip, companions, expenses, settlements);
  const currency = ledger.currency;
  const budget = budgetStatus(ledger);
  const days = dayRows(trip, ledger.byDate);
  const busiestDay = Math.max(0, ...days.map((day) => day.total));
  const unconvertible = expenses.filter((expense) => ledger.unconvertible.includes(expense.id));

  return (
    <main className="flex flex-1 flex-col">
      <Section
        title="예산"
        action={
          <button
            type="button"
            onClick={() => setEditingBudget(true)}
            className="-my-3 -mr-2 h-11 rounded-full px-3 text-sm font-semibold text-brand-600 active:bg-brand-50"
          >
            {budget ? '예산 수정' : '예산 정하기'}
          </button>
        }
      >
        <p className="text-sm text-gray-600">총 지출</p>
        <p className="text-2xl font-bold tabular-nums">{formatMoney(ledger.total, currency)}</p>
        {budget ? (
          <div className="mt-3">
            <BudgetBar status={budget} currency={currency} />
          </div>
        ) : (
          <p className="mt-1 text-sm text-gray-500">
            여행 예산을 정하면 얼마나 남았는지 알려 드려요.
          </p>
        )}
      </Section>

      {expenses.length === 0 ? (
        <EmptyState title="아직 지출이 없어요" description="지출을 기록하면 여기에 정리돼요." />
      ) : (
        <>
          <Section title="카테고리별">
            <ul className="flex flex-col gap-3.5">
              {categoryRows(ledger).map((row) => (
                <li key={row.category}>
                  <BarRow
                    label={
                      <>
                        <span aria-hidden="true">{CATEGORY_ICONS[row.category]} </span>
                        {CATEGORY_LABELS[row.category]}
                      </>
                    }
                    amount={formatMoney(row.total, currency)}
                    fill={row.share}
                    note={formatShare(row.share)}
                  />
                </li>
              ))}
            </ul>
          </Section>

          <Section title="날짜별">
            <ul className="flex flex-col gap-3.5">
              {days.map((day) => (
                <li key={day.key}>
                  <BarRow
                    label={
                      <>
                        <span className="font-semibold">{day.title}</span>
                        {day.subtitle && <span className="text-gray-500"> {day.subtitle}</span>}
                      </>
                    }
                    amount={formatMoney(day.total, currency)}
                    fill={busiestDay > 0 ? day.total / busiestDay : 0}
                    muted={day.total === 0}
                  />
                </li>
              ))}
            </ul>
          </Section>

          {companions.length > 1 && (
            <Section
              title="동행자별"
              description="낸 돈은 결제한 금액, 쓴 돈은 함께 나눈 몫과 개인 지출을 더한 금액이에요."
            >
              {/* Amounts never wrap; the name column takes what is left and truncates. */}
              <table className="w-full text-[15px] whitespace-nowrap tabular-nums">
                <thead>
                  <tr className="text-sm text-gray-500">
                    <th scope="col" className="pb-1 text-left font-medium">
                      이름
                    </th>
                    <th scope="col" className="pb-1 pl-4 text-right font-medium">
                      낸 돈
                    </th>
                    <th scope="col" className="pb-1 pl-4 text-right font-medium">
                      쓴 돈
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ledger.balances.map((entry) => (
                    <tr key={entry.companionId}>
                      <th
                        scope="row"
                        className="w-full max-w-0 truncate py-2.5 text-left font-semibold"
                      >
                        {companions.find((c) => c.id === entry.companionId)?.name ?? '?'}
                      </th>
                      <td className="py-2.5 pl-4 text-right">{formatMoney(entry.paid, currency)}</td>
                      <td className="py-2.5 pl-4 text-right">{formatMoney(entry.spent, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}
        </>
      )}

      {unconvertible.length > 0 && (
        <Section
          title="환율을 다시 입력해야 하는 지출"
          description={`정산 통화(${currency})가 아닌 통화 기준 환율이라 합계에서 빠졌어요. 눌러서 환율을 고쳐 주세요.`}
        >
          <ul className="-mx-1 flex flex-col">
            {unconvertible.map((expense) => (
              <li key={expense.id}>
                <Link
                  to={`/trips/${trip.id}/expenses/${expense.id}`}
                  className="flex items-center gap-3 rounded-xl px-1 py-2.5 active:bg-gray-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{expenseTitle(expense)}</span>
                    <span className="block text-sm text-gray-500">{formatDate(expense.date)}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatMoney(expense.amount, expense.currency)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {usesApiRates(expenses) && <RateAttribution />}

      {editingBudget && <BudgetSheet trip={trip} onClose={() => setEditingBudget(false)} />}
    </main>
  );
}

interface SectionProps {
  title: string;
  description?: string;
  /** Small control at the end of the title row. */
  action?: ReactNode;
  children: ReactNode;
}

function Section({ title, description, action, children }: SectionProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="border-b border-gray-100 px-4 py-5">
      <div className="flex min-h-5 items-center justify-between gap-3">
        <h2 id={titleId} className="text-[15px] font-bold">
          {title}
        </h2>
        {action}
      </div>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

interface BarRowProps {
  label: ReactNode;
  amount: string;
  /** Bar length, 0–1. */
  fill: number;
  /** Shown after the bar, e.g. the share. */
  note?: string;
  /** Nothing spent: grey amount. */
  muted?: boolean;
}

function BarRow({ label, amount, fill, note, muted = false }: BarRowProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[15px]">
        <span className="min-w-0 truncate">{label}</span>
        <span className={`shrink-0 font-semibold tabular-nums ${muted ? 'text-gray-400' : ''}`}>
          {amount}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${fill * 100}%` }} />
        </div>
        {note && (
          <span className="w-14 shrink-0 text-right text-xs text-gray-500 tabular-nums">{note}</span>
        )}
      </div>
    </div>
  );
}
