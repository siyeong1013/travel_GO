import { countryStore } from '@/features/countries/countryStore';
import { expenseStore } from '@/features/expenses/expenseStore';
import { scheduleStore } from '@/features/schedule/scheduleStore';
import { tripStore } from '@/features/trips/tripStore';

/** Empties the stores holding the person's data, so every screen reads it again. */
export function resetDataStores() {
  tripStore.setState(tripStore.getInitialState(), true);
  scheduleStore.setState(scheduleStore.getInitialState(), true);
  expenseStore.setState(expenseStore.getInitialState(), true);
  countryStore.setState(countryStore.getInitialState(), true);
}

/** Has the stores holding the person's data read it again in place; the screens stay meanwhile. */
export async function reloadDataStores() {
  await Promise.all([
    tripStore.getState().reload(),
    scheduleStore.getState().reload(),
    expenseStore.getState().reload(),
    countryStore.getState().reload(),
  ]);
}
