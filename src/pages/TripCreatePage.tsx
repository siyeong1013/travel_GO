import { useState } from 'react';
import { useNavigate } from 'react-router';
import { PageHeader } from '@/components/ui/PageHeader';
import { emptyTripForm, toNewTrip } from '@/features/trips/tripForm';
import { TripForm } from '@/features/trips/TripForm';
import { useTripStore } from '@/features/trips/tripStore';
import { newId } from '@/lib/id';

export function TripCreatePage() {
  const navigate = useNavigate();
  const createTrip = useTripStore((state) => state.create);
  // Made up front: the form shows the trip's cover color (picked by its id) while it's typed in.
  const [tripId] = useState(newId);

  return (
    <>
      <PageHeader title="새 여행" back />
      <TripForm
        tripId={tripId}
        initialValues={emptyTripForm}
        submitLabel="만들기"
        onSubmit={async (values) => {
          const trip = await createTrip(toNewTrip(values), { id: tripId });
          // Replace the form in history so "back" from the new trip goes to the list.
          navigate(`/trips/${trip.id}`, { replace: true });
        }}
      />
    </>
  );
}
