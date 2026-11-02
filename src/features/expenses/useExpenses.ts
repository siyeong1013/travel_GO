import { useEffect } from 'react';
import type { Companion, ExpenseWithShares, ID, Settlement } from '@/data/models';
import { useExpenseStore } from '@/features/expenses/expenseStore';

const NO_COMPANIONS: Companion[] = [];
const NO_EXPENSES: ExpenseWithShares[] = [];
const NO_SETTLEMENTS: Settlement[] = [];

/** The ledger of `tripId`, loading it when the trip changes. Never returns another trip's data. */
export function useExpenses(tripId: ID | undefined) {
  const currentTripId = useExpenseStore((state) => state.tripId);
  const companions = useExpenseStore((state) => state.companions);
  const expenses = useExpenseStore((state) => state.expenses);
  const settlements = useExpenseStore((state) => state.settlements);
  const status = useExpenseStore((state) => state.status);
  const error = useExpenseStore((state) => state.error);
  const load = useExpenseStore((state) => state.load);
  const isCurrent = tripId !== undefined && currentTripId === tripId;

  useEffect(() => {
    if (tripId && (!isCurrent || status === 'idle')) void load(tripId);
  }, [tripId, isCurrent, status, load]);

  return {
    companions: isCurrent ? companions : NO_COMPANIONS,
    expenses: isCurrent ? expenses : NO_EXPENSES,
    settlements: isCurrent ? settlements : NO_SETTLEMENTS,
    status: isCurrent ? status : 'loading',
    error: isCurrent ? error : null,
    reload: () => (tripId ? load(tripId) : Promise.resolve()),
  };
}
