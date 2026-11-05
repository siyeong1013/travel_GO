import { createStore, useStore } from 'zustand';
import { repositories } from '@/data';
import type { VisitedCountry } from '@/data/models';
import type { Repositories } from '@/data/repositories';
import { tripCountriesToMark } from '@/data/rules/country';
import type { LoadStatus } from '@/features/trips/tripStore';
import { toLocalDate } from '@/lib/dates';
import { errorMessage } from '@/lib/errorMessage';

export interface CountryState {
  /** The countries the person has been to, by code. */
  countries: VisitedCountry[];
  status: LoadStatus;
  error: string | null;
  /** Concurrent calls share one request. */
  load: () => Promise<void>;
  /**
   * Reads them again in place (a sync brought changes), after `markTrips`. Only the marking before
   * the first `load`.
   */
  reload: () => Promise<void>;
  /** Puts the countries of trips that have begun on the map (`tripCountriesToMark`). */
  markTrips: () => Promise<void>;
  /** Puts `code` on the map, or takes it off. Shown at once. */
  setVisited: (code: string, visited: boolean) => Promise<void>;
}

export function createCountryStore(repos: Pick<Repositories, 'countries' | 'trips'>) {
  let inflight: Promise<void> | null = null;
  let marking: Promise<void> | null = null;

  /** One at a time: the app starting and the page opening ask together. */
  function markBegunTrips() {
    marking ??= (async () => {
      try {
        const [trips, marks] = await Promise.all([repos.trips.list(), repos.countries.listAll()]);
        for (const code of tripCountriesToMark(trips, marks, toLocalDate())) {
          await repos.countries.set(code, true);
        }
      } catch (error) {
        console.error(error);
      } finally {
        marking = null;
      }
    })();
    return marking;
  }

  return createStore<CountryState>()((set, get) => ({
    countries: [],
    status: 'idle',
    error: null,

    load() {
      inflight ??= (async () => {
        set({ status: 'loading', error: null });
        try {
          await markBegunTrips();
          set({ countries: await repos.countries.list(), status: 'ready' });
        } catch (error) {
          console.error(error);
          set({ status: 'error', error: errorMessage(error) });
        } finally {
          inflight = null;
        }
      })();
      return inflight;
    },

    async reload() {
      await markBegunTrips();
      if (get().status === 'idle') return;
      await inflight;
      try {
        set({ countries: await repos.countries.list(), status: 'ready', error: null });
      } catch (error) {
        console.error(error);
      }
    },

    markTrips: markBegunTrips,

    async setVisited(code, visited) {
      const country = await repos.countries.set(code, visited);
      set((state) => {
        const others = state.countries.filter((c) => c.id !== code);
        return {
          countries: visited
            ? [...others, country].sort((a, b) => (a.id < b.id ? -1 : 1))
            : others,
        };
      });
    },
  }));
}

export const countryStore = createCountryStore(repositories);

export function useCountryStore<T>(selector: (state: CountryState) => T): T {
  return useStore(countryStore, selector);
}
