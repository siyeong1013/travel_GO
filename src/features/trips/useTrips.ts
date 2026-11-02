import { useEffect } from 'react';
import { useTripStore } from '@/features/trips/tripStore';

/** Trips from the store, loading them on first use. */
export function useTrips() {
  const trips = useTripStore((state) => state.trips);
  const status = useTripStore((state) => state.status);
  const error = useTripStore((state) => state.error);
  const load = useTripStore((state) => state.load);

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  return { trips, status, error, reload: load };
}
