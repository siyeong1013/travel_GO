import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import type { Companion, ExpenseWithShares, ID, ScheduleItem, Trip } from '@/data/models';
import { useExpenses } from '@/features/expenses/useExpenses';
import { useSchedule } from '@/features/schedule/useSchedule';
import { TripNotFound } from '@/features/trips/TripNotFound';
import { useTrips } from '@/features/trips/useTrips';

export interface LedgerData {
  trip: Trip;
  companions: Companion[];
  expenses: ExpenseWithShares[];
  scheduleItems: ScheduleItem[];
}

interface ExpensePageShellProps {
  tripId: ID | undefined;
  title: string;
  /** Rendered once the trip, its ledger and its schedule are loaded. */
  children: (data: LedgerData) => ReactNode;
}

/** Header and loading/error states of the expense form pages. */
export function ExpensePageShell({ tripId, title, children }: ExpensePageShellProps) {
  const { trips, status: tripStatus } = useTrips();
  const ledger = useExpenses(tripId);
  const schedule = useSchedule(tripId);
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
  } else if (ledger.status === 'ready' && schedule.status !== 'idle' && schedule.status !== 'loading') {
    // The form works without schedule links if those failed to load.
    body = children({
      trip,
      companions: ledger.companions,
      expenses: ledger.expenses,
      scheduleItems: schedule.items,
    });
  }

  return (
    <>
      <PageHeader title={title} back backFallback={backFallback} />
      {body}
    </>
  );
}
