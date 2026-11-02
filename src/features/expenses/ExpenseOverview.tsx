import type { Companion } from '@/data/models';
import type { Ledger } from '@/data/rules/ledger';
import { formatMoney } from '@/lib/format';

interface ExpenseOverviewProps {
  ledger: Ledger;
  companions: Companion[];
  onManageCompanions: () => void;
  onChangeCurrency: () => void;
}

/** Total in the settlement currency, and who is on the trip. */
export function ExpenseOverview({
  ledger,
  companions,
  onManageCompanions,
  onChangeCurrency,
}: ExpenseOverviewProps) {
  return (
    <section aria-label="가계부 요약" className="mx-4 mt-3 rounded-2xl bg-brand-50 px-4 pt-4 pb-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-600">총 지출</p>
          <p className="mt-0.5 truncate text-2xl font-bold tabular-nums">
            {formatMoney(ledger.total, ledger.currency)}
          </p>
        </div>
        <button
          type="button"
          onClick={onChangeCurrency}
          className="-mr-1 h-11 shrink-0 rounded-full px-3 text-sm font-semibold text-brand-700 active:bg-brand-100"
        >
          <span className="sr-only">정산 통화 </span>
          {ledger.currency} 기준
        </button>
      </div>
      {ledger.unconvertible.length > 0 && (
        <p className="mt-2 text-sm text-red-600">
          환율을 다시 입력해야 하는 지출 {ledger.unconvertible.length}건은 합계에서 빠졌어요.
        </p>
      )}
      <div className="mt-3 flex items-center gap-2 border-t border-brand-100 pt-1">
        <p className="min-w-0 flex-1 truncate text-sm text-gray-700">
          <span className="font-semibold">{companions.length}명</span>
          {' · '}
          {companions.map((c) => c.name).join(', ')}
        </p>
        <button
          type="button"
          onClick={onManageCompanions}
          className="-mr-1 h-11 shrink-0 rounded-full px-3 text-sm font-semibold text-brand-700 active:bg-brand-100"
        >
          동행자 관리
        </button>
      </div>
    </section>
  );
}
