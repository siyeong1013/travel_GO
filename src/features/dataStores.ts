import { expenseStore } from '@/features/expenses/expenseStore';
import { scheduleStore } from '@/features/schedule/scheduleStore';
import { tripStore } from '@/features/trips/tripStore';

/** Empties the stores holding trip data, so every screen reads it again. */
export function resetDataStores() {
  tripStore.setState(tripStore.getInitialState(), true);
  scheduleStore.setState(scheduleStore.getInitialState(), true);
  expenseStore.setState(expenseStore.getInitialState(), true);
}

/** Has the stores holding trip data read it again in place; what the screens show stays meanwhile. */
export async function reloadDataStores() {
  await Promise.all([
    tripStore.getState().reload(),
    scheduleStore.getState().reload(),
    expenseStore.getState().reload(),
  ]);
}
