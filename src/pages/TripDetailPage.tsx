import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { buttonClass } from '@/components/ui/buttonClass';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import type { ID } from '@/data/models';
import { TripSchedule } from '@/features/schedule/TripSchedule';
import { useSchedule } from '@/features/schedule/useSchedule';
import { TripActions } from '@/features/trips/TripActions';
import { useTripStore } from '@/features/trips/tripStore';
import { TripSummary } from '@/features/trips/TripSummary';
import { useTrips } from '@/features/trips/useTrips';
import { toLocalDate } from '@/lib/dates';

export function TripDetailPage() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const { trips, status } = useTrips();
  const { items } = useSchedule(tripId);
  const removeTrip = useTripStore((state) => state.remove);
  const [deleting, setDeleting] = useState(false);
  const trip = trips.find((t) => t.id === tripId);

  if (!trip) {
    // Right after deleting, until the navigation below lands.
    if (deleting) return null;
    if (status === 'idle' || status === 'loading') return <PageHeader title="" back />;
    return (
      <>
        <PageHeader title="travel GO" back />
        <main className="flex flex-1 flex-col items-center">
          <EmptyState title="여행을 찾을 수 없어요" description="삭제되었거나 잘못된 주소예요." />
          <Link to="/" replace className={`${buttonClass('secondary')} mb-16`}>
            여행 목록으로
          </Link>
        </main>
      </>
    );
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

  return (
    <>
      <PageHeader
        title={trip.title}
        back
        right={
          <TripActions
            trip={trip}
            itemCount={items.length}
            onDelete={() => deleteTrip(trip.id)}
          />
        }
      />
      <main className="flex flex-1 flex-col">
        <TripSummary trip={trip} today={today} />
        <TripSchedule trip={trip} today={today} />
      </main>
    </>
  );
}
