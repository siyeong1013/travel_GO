import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { iconButtonClass, iconButtonOnCoverClass } from '@/components/ui/buttonClass';
import { PageHeader } from '@/components/ui/PageHeader';
import type { ID } from '@/data/models';
import { TripExpenses } from '@/features/expenses/TripExpenses';
import { useExpenses } from '@/features/expenses/useExpenses';
import { usePlaceDataRefresh } from '@/features/places/placeRefresh';
import { TripSchedule } from '@/features/schedule/TripSchedule';
import { useSchedule } from '@/features/schedule/useSchedule';
import { TripActions } from '@/features/trips/TripActions';
import { TripCover } from '@/features/trips/TripCover';
import { TripNotFound } from '@/features/trips/TripNotFound';
import { TripPageHeader } from '@/features/trips/TripPageHeader';
import { useTripStore } from '@/features/trips/tripStore';
import { viewOf } from '@/features/trips/tripView';
import { TripViewTabs } from '@/features/trips/TripViewTabs';
import { useTrips } from '@/features/trips/useTrips';
import { toLocalDate } from '@/lib/dates';
import { useScrolledPast } from '@/lib/useScrolledPast';

export function TripDetailPage() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { trips, status } = useTrips();
  // Both halves load up front: the delete confirmation counts items and expenses.
  const { items, status: itemsStatus } = useSchedule(tripId);
  const { expenses } = useExpenses(tripId);
  const removeTrip = useTripStore((state) => state.remove);
  const [deleting, setDeleting] = useState(false);
  const [header, setHeader] = useState<HTMLElement | null>(null);
  const [coverStart, setCoverStart] = useState<HTMLDivElement | null>(null);
  const [coverEnd, setCoverEnd] = useState<HTMLDivElement | null>(null);
  // The header is see-through over the cover only at the very top of the page.
  const solid = useScrolledPast(coverStart, header);
  const showTitle = useScrolledPast(coverEnd, header);
  const trip = trips.find((t) => t.id === tripId);
  // Google's place data is kept for 30 days at most: fetch it again while online.
  usePlaceDataRefresh(trip, items, itemsStatus === 'ready');

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
      <TripPageHeader
        ref={setHeader}
        title={trip.title}
        solid={solid}
        showTitle={showTitle}
        right={
          <TripActions
            trip={trip}
            itemCount={items.length}
            expenseCount={expenses.length}
            onDelete={() => deleteTrip(trip.id)}
            buttonClassName={solid ? iconButtonClass : iconButtonOnCoverClass}
          />
        }
      />
      <main className="flex flex-1 flex-col">
        <TripCover trip={trip} today={today} startRef={setCoverStart} endRef={setCoverEnd} />
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
