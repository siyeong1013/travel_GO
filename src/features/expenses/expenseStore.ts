import { createStore, useStore } from 'zustand';
import { repositories } from '@/data';
import type { Companion, ExpenseWithShares, ID, Settlement } from '@/data/models';
import type {
  CompanionUsage,
  ExpenseInput,
  NewCompanion,
  NewExpense,
  NewSettlement,
  Repositories,
  UsedRate,
} from '@/data/repositories';
import type { LoadStatus } from '@/features/trips/tripStore';
import { errorMessage } from '@/lib/errorMessage';

export interface ExpenseState {
  /** The trip whose ledger is held. One trip at a time (the open detail page). */
  tripId: ID | null;
  /** In `order`; "나" first. */
  companions: Companion[];
  /** By date, then `createdAt`. */
  expenses: ExpenseWithShares[];
  settlements: Settlement[];
  status: LoadStatus;
  error: string | null;
  /** Switches to `tripId`. Concurrent calls for the same trip share one request. */
  load: (tripId: ID) => Promise<void>;
  addCompanion: (input: NewCompanion) => Promise<Companion>;
  renameCompanion: (id: ID, name: string) => Promise<Companion>;
  /** What deleting would touch; the confirmation shows it. */
  companionUsage: (id: ID) => Promise<CompanionUsage>;
  /** Expenses are re-read afterwards: equal/ratio splits they were in get re-split. */
  removeCompanion: (id: ID) => Promise<void>;
  addExpense: (input: NewExpense) => Promise<ExpenseWithShares>;
  updateExpense: (id: ID, input: ExpenseInput) => Promise<ExpenseWithShares>;
  removeExpense: (id: ID) => Promise<void>;
  /** The latest rate used per currency in any trip; expense forms start from them. */
  usedRates: () => Promise<UsedRate[]>;
  /** Records a transfer as done ("송금 완료"): balances count it. */
  addSettlement: (input: NewSettlement) => Promise<Settlement>;
  /** Unchecks a done transfer: deletes its record. */
  removeSettlement: (id: ID) => Promise<void>;
}

type LedgerRepositories = Pick<Repositories, 'companions' | 'expenses' | 'settlements'>;

export function createExpenseStore(repos: LedgerRepositories) {
  let inflight: { tripId: ID; promise: Promise<void> } | null = null;

  return createStore<ExpenseState>()((set, get) => {
    /** Re-reads from storage, unless the store has switched to another trip meanwhile. */
    async function refresh(tripId: ID) {
      const [companions, expenses, settlements] = await Promise.all([
        repos.companions.listByTrip(tripId),
        repos.expenses.listByTrip(tripId),
        repos.settlements.listByTrip(tripId),
      ]);
      if (get().tripId === tripId) {
        set({ companions, expenses, settlements, status: 'ready', error: null });
      }
    }

    /** Runs a write, then re-reads the open trip (writes may reorder or re-split others). */
    async function writeThenRefresh<T>(write: () => Promise<T>): Promise<T> {
      const result = await write();
      const { tripId } = get();
      if (tripId) await refresh(tripId);
      return result;
    }

    return {
      tripId: null,
      companions: [],
      expenses: [],
      settlements: [],
      status: 'idle',
      error: null,

      load(tripId) {
        if (inflight?.tripId === tripId) return inflight.promise;
        if (get().tripId !== tripId) set({ tripId, companions: [], expenses: [], settlements: [] });
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

      async addCompanion(input) {
        const companion = await repos.companions.create(input);
        if (get().tripId === input.tripId) {
          set((state) => ({ companions: [...state.companions, companion] }));
        }
        return companion;
      },

      async renameCompanion(id, name) {
        const renamed = await repos.companions.rename(id, name);
        set((state) => ({ companions: state.companions.map((c) => (c.id === id ? renamed : c)) }));
        return renamed;
      },

      companionUsage(id) {
        return repos.companions.usage(id);
      },

      removeCompanion(id) {
        return writeThenRefresh(() => repos.companions.delete(id));
      },

      addExpense(input) {
        return writeThenRefresh(() => repos.expenses.create(input));
      },

      updateExpense(id, input) {
        return writeThenRefresh(() => repos.expenses.update(id, input));
      },

      removeExpense(id) {
        return writeThenRefresh(() => repos.expenses.delete(id));
      },

      usedRates() {
        return repos.expenses.usedRates();
      },

      // Settlements touch no other record: applied in place (newest last, like `listByTrip`).
      async addSettlement(input) {
        const settlement = await repos.settlements.create(input);
        if (get().tripId === input.tripId) {
          set((state) => ({ settlements: [...state.settlements, settlement] }));
        }
        return settlement;
      },

      async removeSettlement(id) {
        await repos.settlements.delete(id);
        set((state) => ({ settlements: state.settlements.filter((s) => s.id !== id) }));
      },
    };
  });
}

export const expenseStore = createExpenseStore(repositories);

export function useExpenseStore<T>(selector: (state: ExpenseState) => T): T {
  return useStore(expenseStore, selector);
}
