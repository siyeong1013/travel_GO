import { Link } from 'react-router';
import { ChevronRightIcon } from '@/components/ui/icons';
import type { Companion } from '@/data/models';
import type { Ledger } from '@/data/rules/ledger';
import { BudgetBar } from '@/features/expenses/BudgetBar';
import { budgetStatus } from '@/features/expenses/summaryDisplay';
import { formatMoney } from '@/lib/format';

interface ExpenseOverviewProps {
  ledger: Ledger;
  companions: Companion[];
  /** The summary page (by category, day and person). */
  summaryHref: string;
  /** The settlement page, and how many transfers it still lists. */
  settlementHref: string;
  pendingTransfers: number;
  onManageCompanions: () => void;
  onChangeCurrency: () => void;
  onEditBudget: () => void;
}

const actionClass =
  'flex h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-brand-600 active:bg-gray-200/70';

/** Total in the settlement currency against the budget, who is on the trip, what is left to settle. */
export function ExpenseOverview({
  ledger,
  companions,
  summaryHref,
  settlementHref,
  pendingTransfers,
  onManageCompanions,
  onChangeCurrency,
  onEditBudget,
}: ExpenseOverviewProps) {
  const budget = budgetStatus(ledger);

  return (
    <section aria-label="가계부 요약" className="mx-4 mt-4 rounded-3xl bg-gray-50 px-5 pt-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-500">총 지출</p>
          <p className="mt-1 truncate text-[28px] leading-tight font-bold tabular-nums">
            {formatMoney(ledger.total, ledger.currency)}
          </p>
        </div>
        <button type="button" onClick={onChangeCurrency} className={`-mr-1 ${actionClass}`}>
          <span className="sr-only">정산 통화 </span>
          {ledger.currency} 기준
        </button>
      </div>
      {budget && (
        <div className="mt-3">
          <BudgetBar status={budget} currency={ledger.currency} />
        </div>
      )}
      {ledger.unconvertible.length > 0 && (
        <p className="mt-2 text-sm text-red-600">
          환율을 다시 입력해야 하는 지출 {ledger.unconvertible.length}건은 합계에서 빠졌어요.
        </p>
      )}
      <div className="mt-4 flex items-center gap-2 border-t border-gray-200/70 pt-1">
        <p className="min-w-0 flex-1 truncate text-sm text-gray-700">
          <span className="font-semibold">{companions.length}명</span>
          {' · '}
          {companions.map((c) => c.name).join(', ')}
        </p>
        <button type="button" onClick={onManageCompanions} className={`-mr-1 ${actionClass}`}>
          동행자 관리
        </button>
      </div>
      {/* Nothing to settle alone. */}
      {companions.length > 1 && (
        <Link
          to={settlementHref}
          className="-mx-5 flex min-h-12 items-center gap-2 border-t border-gray-200/70 px-5 text-sm active:bg-gray-200/70"
        >
          <span className="font-semibold">정산</span>{' '}
          <span className="min-w-0 flex-1 truncate text-gray-700">
            {pendingTransfers > 0 ? `송금 ${pendingTransfers}건 남았어요` : '주고받을 돈이 없어요'}
          </span>
          <ChevronRightIcon width={16} height={16} className="shrink-0 text-gray-400" />
        </Link>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-gray-200/70 py-1">
        <button type="button" onClick={onEditBudget} className={`-ml-3 ${actionClass}`}>
          {ledger.budget === null ? '예산 정하기' : '예산 수정'}
        </button>
        <Link to={summaryHref} className={`-mr-1 gap-0.5 ${actionClass}`}>
          지출 요약
          <ChevronRightIcon width={16} height={16} />
        </Link>
      </div>
    </section>
  );
}
