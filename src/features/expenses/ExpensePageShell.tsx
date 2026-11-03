import { type ReactNode, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import type {
  Companion,
  ExpenseWithShares,
  ID,
  ScheduleItem,
  Settlement,
  Trip,
} from '@/data/models';
import type { UsedRate } from '@/data/repositories';
import { useExpenseStore } from '@/features/expenses/expenseStore';
import { useExpenses } from '@/features/expenses/useExpenses';
import { useSchedule } from '@/features/schedule/useSchedule';
import { TripNotFound } from '@/features/trips/TripNotFound';
import { useTrips } from '@/features/trips/useTrips';

export interface LedgerData {
  trip: Trip;
  companions: Companion[];
  expenses: ExpenseWithShares[];
  settlements: Settlement[];
  scheduleItems: ScheduleItem[];
  /** Rates used in any trip (latest per currency), for prefilling. */
  usedRates: UsedRate[];
}

interface ExpensePageShellProps {
  tripId: ID | undefined;
  title: string;
  /** Rendered once the trip, its ledger and its schedule are loaded. */
  children: (data: LedgerData) => ReactNode;
}

/** Header and loading/error states of the expense pages (form, summary). */
export function ExpensePageShell({ tripId, title, children }: ExpensePageShellProps) {
  const { trips, status: tripStatus } = useTrips();
  const ledger = useExpenses(tripId);
  const schedule = useSchedule(tripId);
  const usedRates = useUsedRates();
  const trip = trips.find((t) => t.id === tripId);
  const backFallback = `/trips/${tripId}?tab=expenses`;

  if (!trip) {
    if (tripStatus === 'idle' || tripStatus === 'loading') return <PageHeader title="" back />;
    return <TripNotFound />;
  }

  let body: ReactNode = null;
  if (ledger.status === 'error') {
    body = (
      <div className="flex flex-1 flex-col items-center">
        <EmptyState title="가계부를 불러오지 못했어요" description={ledger.error ?? undefined} />
        <Button variant="secondary" onClick={() => void ledger.reload()}>
          다시 시도
        </Button>
      </div>
    );
  } else if (
    ledger.status === 'ready' &&
    schedule.status !== 'idle' &&
    schedule.status !== 'loading' &&
    usedRates
  ) {
    // The form works without schedule links if those failed to load.
    body = children({
      trip,
      companions: ledger.companions,
      expenses: ledger.expenses,
      settlements: ledger.settlements,
      scheduleItems: schedule.items,
      usedRates,
    });
  }

  return (
    <>
      <PageHeader title={title} back backFallback={backFallback} />
      {body}
    </>
  );
}

/**
 * Read afresh for each page (other trips may have new expenses): null until then.
 * Empty if that fails; the form only misses the prefill.
 */
function useUsedRates(): UsedRate[] | null {
  const load = useExpenseStore((state) => state.usedRates);
  const [usedRates, setUsedRates] = useState<UsedRate[] | null>(null);

  useEffect(() => {
    let current = true;
    load().then(
      (rates) => current && setUsedRates(rates),
      (error: unknown) => {
        console.error(error);
        if (current) setUsedRates([]);
      },
    );
    return () => {
      current = false;
    };
  }, [load]);

  return usedRates;
}
