import { useEffect } from 'react';
import type { ChecklistItem, ID } from '@/data/models';
import { useChecklistStore } from '@/features/checklist/checklistStore';

const NO_ITEMS: ChecklistItem[] = [];

/** The checklist of `tripId`, loading it when the trip changes. Never returns another trip's. */
export function useChecklist(tripId: ID | undefined) {
  const currentTripId = useChecklistStore((state) => state.tripId);
  const items = useChecklistStore((state) => state.items);
  const status = useChecklistStore((state) => state.status);
  const error = useChecklistStore((state) => state.error);
  const load = useChecklistStore((state) => state.load);
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
