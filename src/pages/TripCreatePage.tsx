import { useState } from 'react';
import { useNavigate } from 'react-router';
import { PageHeader } from '@/components/ui/PageHeader';
import { flightScheduleItems } from '@/features/schedule/flightDrafts';
import { useScheduleStore } from '@/features/schedule/scheduleStore';
import { emptyTripForm, toNewTrip } from '@/features/trips/tripForm';
import { TripForm } from '@/features/trips/TripForm';
import { useTripStore } from '@/features/trips/tripStore';
import { newId } from '@/lib/id';

export function TripCreatePage() {
  const navigate = useNavigate();
  const createTrip = useTripStore((state) => state.create);
  const addItem = useScheduleStore((state) => state.add);
  // Made up front: the form shows the trip's cover color (picked by its id) while it's typed in.
  const [tripId] = useState(newId);

  return (
    <>
      <PageHeader title="새 여행" back />
      <TripForm
        tripId={tripId}
        initialValues={emptyTripForm}
        submitLabel="만들기"
        withFlights
        onSubmit={async (values) => {
          const trip = await createTrip(toNewTrip(values), { id: tripId });
          // Then its flights: one that fails is left out (logged), not the trip.
          for (const item of flightScheduleItems(values.flights, trip)) {
            await addItem(item).catch((error: unknown) => console.error(error));
          }
          // Replace the form in history so "back" from the new trip goes to the list.
          navigate(`/trips/${trip.id}`, { replace: true });
        }}
      />
    </>
  );
}
