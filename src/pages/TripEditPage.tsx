import { useState } from 'react';
import { useParams } from 'react-router';
import { PageHeader } from '@/components/ui/PageHeader';
import type { ID, LocalDate } from '@/data/models';
import {
  OutOfRangeItemsError,
  type TripPatch,
  type TripUpdateOptions,
} from '@/data/repositories';
import { useScheduleStore } from '@/features/schedule/scheduleStore';
import { OutOfRangeSheet } from '@/features/trips/OutOfRangeSheet';
import { toFormValues, toTripPatch } from '@/features/trips/tripForm';
import { TripForm } from '@/features/trips/TripForm';
import { TripNotFound } from '@/features/trips/TripNotFound';
import { useTripStore } from '@/features/trips/tripStore';
import { useTrips } from '@/features/trips/useTrips';
import { useGoBack } from '@/lib/useGoBack';

interface PendingSave {
  patch: TripPatch;
  count: number;
  dates: LocalDate[];
}

export function TripEditPage() {
  const { tripId } = useParams();
  const { trips, status } = useTrips();
  const updateTrip = useTripStore((state) => state.update);
  const reloadSchedule = useScheduleStore((state) => state.load);
  const goBack = useGoBack(`/trips/${tripId}`);
  const [pending, setPending] = useState<PendingSave | null>(null);
  const trip = trips.find((t) => t.id === tripId);

  if (!trip) {
    if (status === 'idle' || status === 'loading') return <PageHeader title="" back />;
    return <TripNotFound />;
  }

  async function save(id: ID, patch: TripPatch, options?: TripUpdateOptions) {
    await updateTrip(id, patch, options);
    // Items moved to the inbox or deleted must show up on the detail page.
    if (options?.outOfRangeItems) await reloadSchedule(id);
    goBack();
  }

  return (
    <>
      <PageHeader title="여행 정보 수정" back backFallback={`/trips/${trip.id}`} />
      <TripForm
        tripId={trip.id}
        initialValues={toFormValues(trip)}
        submitLabel="저장"
        onSubmit={async (values) => {
          const patch = toTripPatch(values, trip);
          // Nothing changed: don't bump updatedAt (it decides backup merges).
          if (Object.keys(patch).length === 0) return goBack();
          try {
            await save(trip.id, patch);
          } catch (error) {
            if (!(error instanceof OutOfRangeItemsError)) throw error;
            setPending({ patch, count: error.count, dates: error.dates });
          }
        }}
      />
      {pending && (
        <OutOfRangeSheet
          count={pending.count}
          dates={pending.dates}
          onChoose={(action) => save(trip.id, pending.patch, { outOfRangeItems: action })}
          onClose={() => setPending(null)}
        />
      )}
    </>
  );
}
