import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/ui/PageHeader';
import type { ID } from '@/data/models';
import { TripExpenses } from '@/features/expenses/TripExpenses';
import { useExpenses } from '@/features/expenses/useExpenses';
import { TripSchedule } from '@/features/schedule/TripSchedule';
import { useSchedule } from '@/features/schedule/useSchedule';
import { TripActions } from '@/features/trips/TripActions';
import { TripNotFound } from '@/features/trips/TripNotFound';
import { useTripStore } from '@/features/trips/tripStore';
import { TripSummary } from '@/features/trips/TripSummary';
import { viewOf } from '@/features/trips/tripView';
import { TripViewTabs } from '@/features/trips/TripViewTabs';
import { useTrips } from '@/features/trips/useTrips';
import { toLocalDate } from '@/lib/dates';

export function TripDetailPage() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { trips, status } = useTrips();
  // Both halves load up front: the delete confirmation counts items and expenses.
  const { items } = useSchedule(tripId);
  const { expenses } = useExpenses(tripId);
  const removeTrip = useTripStore((state) => state.remove);
  const [deleting, setDeleting] = useState(false);
  const trip = trips.find((t) => t.id === tripId);

  if (!trip) {
    // Right after deleting, until the navigation below lands.
    if (deleting) return null;
    if (status === 'idle' || status === 'loading') return <PageHeader title="" back />;
    return <TripNotFound />;
  }

  async function deleteTrip(id: ID) {
    setDeleting(true);
    try {
      await removeTrip(id);
      navigate('/', { replace: true });
    } catch (error) {
      setDeleting(false);
      throw error;
    }
  }

  const today = toLocalDate();
  const view = viewOf(params);

  return (
    <>
      <PageHeader
        title={trip.title}
        back
        right={
          <TripActions
            trip={trip}
            itemCount={items.length}
            expenseCount={expenses.length}
            onDelete={() => deleteTrip(trip.id)}
          />
        }
      />
      <main className="flex flex-1 flex-col">
        <TripSummary trip={trip} today={today} />
        <TripViewTabs view={view} />
        {view === 'schedule' ? (
          <TripSchedule trip={trip} today={today} />
        ) : (
          <TripExpenses trip={trip} />
        )}
      </main>
    </>
  );
}
