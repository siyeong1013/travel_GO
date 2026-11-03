import type { CurrencyCode } from '@/data/models';
import type { BudgetStatus } from '@/features/expenses/summaryDisplay';
import { formatMoney } from '@/lib/format';

/** How much of the budget is spent: a bar (decorative), what is left or over, and the budget. */
export function BudgetBar({ status, currency }: { status: BudgetStatus; currency: CurrencyCode }) {
  const over = status.remaining < 0;
  return (
    <div>
      <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-gray-900/8">
        <div
          className={`h-full rounded-full ${over ? 'bg-red-500' : 'bg-brand-500'}`}
          style={{ width: `${status.fill * 100}%` }}
        />
      </div>
      <p className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-sm tabular-nums">
        <span className={`font-semibold ${over ? 'text-red-600' : 'text-gray-800'}`}>
          {over
            ? `${formatMoney(-status.remaining, currency)} 초과`
            : `${formatMoney(status.remaining, currency)} 남음`}
        </span>
        <span className="text-gray-500">
          예산 {formatMoney(status.budget, currency)}
          {status.percent !== null && ` · ${status.percent}% 사용`}
        </span>
      </p>
    </div>
  );
}
