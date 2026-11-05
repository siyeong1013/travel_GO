import { useParams } from 'react-router';
import { PageHeader } from '@/components/ui/PageHeader';
import { TripPeople } from '@/features/sharing/TripPeople';
import { TripNotFound } from '@/features/trips/TripNotFound';
import { useTrips } from '@/features/trips/useTrips';

export function TripPeoplePage() {
  const { tripId } = useParams();
  const { trips, status } = useTrips();
  const trip = trips.find((t) => t.id === tripId);

  if (!trip) {
    if (status === 'idle' || status === 'loading') return <PageHeader title="" back />;
    return <TripNotFound />;
  }
  return (
    <>
      <PageHeader title="함께하는 사람" back backFallback={`/trips/${trip.id}`} />
      <main className="flex flex-1 flex-col">
        <TripPeople trip={trip} />
      </main>
    </>
  );
}
