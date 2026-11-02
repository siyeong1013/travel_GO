import { createStore, useStore } from 'zustand';
import { repositories } from '@/data';
import type { ID, Trip } from '@/data/models';
import type { NewTrip, Repositories } from '@/data/repositories';
import { compareTrips } from '@/data/rules/trip';
import { errorMessage } from '@/lib/errorMessage';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface TripState {
  /** Sorted like `TripRepository.list()`. */
  trips: Trip[];
  status: LoadStatus;
  error: string | null;
  /** Concurrent calls share one request. */
  load: () => Promise<void>;
  /** Throws repository errors to the caller (forms show them). */
  create: (input: NewTrip) => Promise<Trip>;
  remove: (id: ID) => Promise<void>;
}

export function createTripStore(repos: Pick<Repositories, 'trips'>) {
  let inflight: Promise<void> | null = null;

  return createStore<TripState>()((set) => ({
    trips: [],
    status: 'idle',
    error: null,

    load() {
      inflight ??= (async () => {
        set({ status: 'loading', error: null });
        try {
          set({ trips: await repos.trips.list(), status: 'ready' });
        } catch (error) {
          console.error(error);
          set({ status: 'error', error: errorMessage(error) });
        } finally {
          inflight = null;
        }
      })();
      return inflight;
    },

    async create(input) {
      const trip = await repos.trips.create(input);
      set((state) => ({ trips: [...state.trips, trip].sort(compareTrips) }));
      return trip;
    },

    async remove(id) {
      await repos.trips.delete(id);
      set((state) => ({ trips: state.trips.filter((trip) => trip.id !== id) }));
    },
  }));
}

export const tripStore = createTripStore(repositories);

export function useTripStore<T>(selector: (state: TripState) => T): T {
  return useStore(tripStore, selector);
}
