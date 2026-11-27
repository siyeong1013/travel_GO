import { createStore, useStore } from 'zustand';
import { repositories } from '@/data';
import type { ChecklistItem, ID } from '@/data/models';
import type { ChecklistItemPatch, Repositories } from '@/data/repositories';
import { compareChecklistItems } from '@/data/rules/checklist';
import type { LoadStatus } from '@/features/trips/tripStore';
import { errorMessage } from '@/lib/errorMessage';

export interface ChecklistState {
  /** The trip whose checklist is held. One trip at a time (the open detail page). */
  tripId: ID | null;
  /** In list order. */
  items: ChecklistItem[];
  status: LoadStatus;
  error: string | null;
  /** Switches to `tripId`. Concurrent calls for the same trip share one request. */
  load: (tripId: ID) => Promise<void>;
  /** Reads the held trip's checklist again in place (a sync brought changes). */
  reload: () => Promise<void>;
  add: (tripId: ID, texts: string[]) => Promise<ChecklistItem[]>;
  copyFrom: (fromTripId: ID, toTripId: ID) => Promise<ChecklistItem[]>;
  /** Shown at once; a failed save reads the list again. */
  update: (id: ID, patch: ChecklistItemPatch) => Promise<ChecklistItem>;
  /** Returns the item, to put back with `restore` ("되돌리기"). */
  remove: (id: ID) => Promise<ChecklistItem | null>;
  restore: (item: ChecklistItem) => Promise<void>;
  /** Items per trip, for "지난 여행에서 가져오기". */
  countByTrip: () => Promise<Record<ID, number>>;
}

export function createChecklistStore(repos: Pick<Repositories, 'checklist'>) {
  let inflight: { tripId: ID; promise: Promise<void> } | null = null;

  return createStore<ChecklistState>()((set, get) => {
    async function refresh(tripId: ID) {
      const items = await repos.checklist.listByTrip(tripId);
      if (get().tripId === tripId) set({ items, status: 'ready', error: null });
    }

    /** Puts `items` in the held list when they are of its trip. */
    function merge(tripId: ID, changed: ChecklistItem[]) {
      if (get().tripId !== tripId) return;
      const byId = new Map(get().items.map((item) => [item.id, item]));
      for (const item of changed) byId.set(item.id, item);
      set({ items: [...byId.values()].sort(compareChecklistItems) });
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

      async reload() {
        const { tripId } = get();
        if (tripId) await refresh(tripId).catch((error: unknown) => console.error(error));
      },

      async add(tripId, texts) {
        const added = await repos.checklist.add(tripId, texts);
        merge(tripId, added);
        return added;
      },

      async copyFrom(fromTripId, toTripId) {
        const added = await repos.checklist.copyFrom(fromTripId, toTripId);
        merge(toTripId, added);
        return added;
      },

      async update(id, patch) {
        const before = get().items.find((item) => item.id === id);
        if (before) {
          // A check shows at once; text and assignee are as given (the repository trims).
          set((state) => ({
            items: state.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
          }));
        }
        try {
          const saved = await repos.checklist.update(id, patch);
          merge(saved.tripId, [saved]);
          return saved;
        } catch (error) {
          await get().reload();
          throw error;
        }
      },

      async remove(id) {
        const item = get().items.find((i) => i.id === id) ?? null;
        await repos.checklist.delete(id);
        set((state) => ({ items: state.items.filter((i) => i.id !== id) }));
        return item;
      },

      async restore(item) {
        await repos.checklist.restore(item);
        const { tripId } = get();
        if (tripId === item.tripId) await refresh(tripId);
      },

      countByTrip() {
        return repos.checklist.countByTrip();
      },
    };
  });
}

export const checklistStore = createChecklistStore(repositories);

export function useChecklistStore<T>(selector: (state: ChecklistState) => T): T {
  return useStore(checklistStore, selector);
}
