import { useEffect } from 'react';
import type { ID, ScheduleItem } from '@/data/models';
import { useScheduleStore } from '@/features/schedule/scheduleStore';

const NO_ITEMS: ScheduleItem[] = [];

/** Items of `tripId`, loading them when the trip changes. Never returns another trip's items. */
export function useSchedule(tripId: ID | undefined) {
  const currentTripId = useScheduleStore((state) => state.tripId);
  const items = useScheduleStore((state) => state.items);
  const status = useScheduleStore((state) => state.status);
  const error = useScheduleStore((state) => state.error);
  const load = useScheduleStore((state) => state.load);
  const isCurrent = tripId !== undefined && currentTripId === tripId;

  useEffect(() => {
    if (tripId && (!isCurrent || status === 'idle')) void load(tripId);
  }, [tripId, isCurrent, status, load]);

  return {
    items: isCurrent ? items : NO_ITEMS,
    status: isCurrent ? status : 'loading',
    error: isCurrent ? error : null,
    reload: () => (tripId ? load(tripId) : Promise.resolve()),
  };
}
