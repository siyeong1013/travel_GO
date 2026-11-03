import { createStore, useStore } from 'zustand';
import { repositories } from '@/data';
import type { ID, PlaceData, ScheduleItem } from '@/data/models';
import type {
  NewScheduleItem,
  Repositories,
  ScheduleItemPatch,
  ScheduleMoveTarget,
} from '@/data/repositories';
import { applyChanges, planMove } from '@/data/rules/schedule';
import type { LoadStatus } from '@/features/trips/tripStore';
import { nowIso } from '@/lib/dates';
import { errorMessage } from '@/lib/errorMessage';

export interface ScheduleState {
  /** The trip whose items are held. One trip at a time (the open detail page). */
  tripId: ID | null;
  /** Every item of `tripId`, in display order (`compareItems`). */
  items: ScheduleItem[];
  status: LoadStatus;
  error: string | null;
  /** Switches to `tripId`. Concurrent calls for the same trip share one request. */
  load: (tripId: ID) => Promise<void>;
  add: (input: NewScheduleItem) => Promise<ScheduleItem>;
  update: (id: ID, patch: ScheduleItemPatch) => Promise<ScheduleItem>;
  remove: (id: ID) => Promise<void>;
  /** Shown immediately, then saved; the list is re-read afterwards (rolls back on failure). */
  move: (id: ID, to: ScheduleMoveTarget) => Promise<void>;
  /** Saves freshly fetched Google data of the trip's places; re-reads if it is the held trip. */
  refreshPlaces: (tripId: ID, places: PlaceData[]) => Promise<void>;
}

export function createScheduleStore(repos: Pick<Repositories, 'schedule'>) {
  let inflight: { tripId: ID; promise: Promise<void> } | null = null;

  return createStore<ScheduleState>()((set, get) => {
    /** Re-reads from storage, unless the store has switched to another trip meanwhile. */
    async function refresh(tripId: ID) {
      const items = await repos.schedule.listByTrip(tripId);
      if (get().tripId === tripId) set({ items, status: 'ready', error: null });
    }

    return {
      tripId: null,
      items: [],
      status: 'idle',
      error: null,

      load(tripId) {
        if (inflight?.tripId === tripId) return inflight.promise;
        if (get().tripId !== tripId) set({ tripId, items: [] });
        set({ status: 'loading', error: null });

        const promise = refresh(tripId)
          .catch((error: unknown) => {
            console.error(error);
            if (get().tripId === tripId) set({ status: 'error', error: errorMessage(error) });
          })
          .finally(() => {
            if (inflight?.promise === promise) inflight = null;
          });
        inflight = { tripId, promise };
        return promise;
      },

      async add(input) {
        const item = await repos.schedule.create(input);
        await refresh(input.tripId);
        return item;
      },

      async update(id, patch) {
        const updated = await repos.schedule.update(id, patch);
        set((state) => ({ items: state.items.map((item) => (item.id === id ? updated : item)) }));
        return updated;
      },

      async remove(id) {
        const { tripId } = get();
        await repos.schedule.delete(id);
        if (tripId) await refresh(tripId);
      },

      async move(id, to) {
        const { tripId, items } = get();
        if (!tripId) return;
        set({ items: applyChanges(items, planMove(items, id, to, nowIso())) });
        try {
          await repos.schedule.move(id, to);
        } finally {
          await refresh(tripId);
        }
      },

      async refreshPlaces(tripId, places) {
        await repos.schedule.refreshPlaces(tripId, places);
        await refresh(tripId);
      },
    };
  });
}

export const scheduleStore = createScheduleStore(repositories);

export function useScheduleStore<T>(selector: (state: ScheduleState) => T): T {
  return useStore(scheduleStore, selector);
}
