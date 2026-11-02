import { useNavigate } from 'react-router';
import { PageHeader } from '@/components/ui/PageHeader';
import { emptyTripForm, toNewTrip } from '@/features/trips/tripForm';
import { TripForm } from '@/features/trips/TripForm';
import { useTripStore } from '@/features/trips/tripStore';

export function TripCreatePage() {
  const navigate = useNavigate();
  const createTrip = useTripStore((state) => state.create);

  return (
    <>
      <PageHeader title="새 여행" back />
      <TripForm
        initialValues={emptyTripForm}
        submitLabel="만들기"
        onSubmit={async (values) => {
          const trip = await createTrip(toNewTrip(values));
          // Replace the form in history so "back" from the new trip goes to the list.
          navigate(`/trips/${trip.id}`, { replace: true });
        }}
      />
    </>
  );
}
