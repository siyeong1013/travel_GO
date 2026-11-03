import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { buttonClass } from '@/components/ui/buttonClass';
import { EmptyState } from '@/components/ui/EmptyState';
import { PlusIcon } from '@/components/ui/icons';
import type { Trip } from '@/data/models';
import { buildLedger } from '@/data/rules/ledger';
import { planTransfers } from '@/data/rules/settlementPlan';
import { BudgetSheet } from '@/features/expenses/BudgetSheet';
import { CompanionSheet } from '@/features/expenses/CompanionSheet';
import { groupExpenses, usesApiRates } from '@/features/expenses/expenseDisplay';
import { ExpenseList } from '@/features/expenses/ExpenseList';
import { ExpenseOverview } from '@/features/expenses/ExpenseOverview';
import { RateAttribution } from '@/features/expenses/RateAttribution';
import { SettlementCurrencySheet } from '@/features/expenses/SettlementCurrencySheet';
import { useExpenses } from '@/features/expenses/useExpenses';
import { useSchedule } from '@/features/schedule/useSchedule';

/** The ledger half of the trip page: total and budget, companions, expenses by day, "add expense". */
export function TripExpenses({ trip }: { trip: Trip }) {
  const navigate = useNavigate();
  const { companions, expenses, settlements, status, error, reload } = useExpenses(trip.id);
  const { items } = useSchedule(trip.id);
  const [sheet, setSheet] = useState<'companions' | 'currency' | 'budget' | null>(null);

  const ledger = buildLedger(trip, companions, expenses, settlements);

  let content;
  if (status === 'error') {
    content = (
      <div className="flex flex-1 flex-col items-center">
        <EmptyState title="가계부를 불러오지 못했어요" description={error ?? undefined} />
        <Button variant="secondary" onClick={() => void reload()}>
          다시 시도
        </Button>
      </div>
    );
  } else if (status !== 'ready' && expenses.length === 0) {
    content = (
      <div className="flex flex-col gap-2.5 px-4 py-5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[60px] animate-pulse rounded-2xl bg-gray-100" />
        ))}
      </div>
    );
  } else if (expenses.length === 0) {
    content = (
      <EmptyState title="아직 지출이 없어요" description="아래 버튼으로 쓴 돈을 기록해 보세요." />
    );
  } else {
    content = (
      <>
        <ExpenseList
          tripId={trip.id}
          sections={groupExpenses(trip, expenses)}
          currency={trip.settlementCurrency}
          companions={companions}
          scheduleItems={items}
        />
        {usesApiRates(expenses) && <RateAttribution />}
      </>
    );
  }

  return (
    <>
      <ExpenseOverview
        ledger={ledger}
        companions={companions}
        summaryHref={`/trips/${trip.id}/expenses/summary`}
        settlementHref={`/trips/${trip.id}/expenses/settlement`}
        pendingTransfers={planTransfers(ledger.balances).length}
        onManageCompanions={() => setSheet('companions')}
        onChangeCurrency={() => setSheet('currency')}
        onEditBudget={() => setSheet('budget')}
      />
      <div className="flex flex-1 flex-col">{content}</div>

      <BottomActionBar>
        <Link to={`/trips/${trip.id}/expenses/new`} className={buttonClass('primary', true)}>
          <PlusIcon width={20} height={20} />
          지출 추가
        </Link>
      </BottomActionBar>

      {sheet === 'companions' && (
        <CompanionSheet
          tripId={trip.id}
          companions={companions}
          expenses={expenses}
          onOpenExpense={(id) => void navigate(`/trips/${trip.id}/expenses/${id}`)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'currency' && (
        <SettlementCurrencySheet
          trip={trip}
          locked={expenses.length > 0 || settlements.length > 0}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'budget' && <BudgetSheet trip={trip} onClose={() => setSheet(null)} />}
    </>
  );
}
