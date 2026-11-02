// Helpers for screen-flow tests. The test file must mock '@/data' with test repositories
// (vi.mock is hoisted per file, so it cannot live here).
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '@/app/router';
import { repositories } from '@/data';
import { createBackupFile } from '@/data/rules/backupFormat';
import { scheduleStore } from '@/features/schedule/scheduleStore';
import { tripStore } from '@/features/trips/tripStore';
import { emptyData, T0 } from '@/test/fixtures';

/** Simulates a fresh page load: empty stores, data only in IndexedDB. */
export function resetStores() {
  tripStore.setState(tripStore.getInitialState(), true);
  scheduleStore.setState(scheduleStore.getInitialState(), true);
}

/** Empties the stores and the database. */
export async function resetApp() {
  resetStores();
  await repositories.backup.importAll(createBackupFile(emptyData(), T0), 'overwrite');
}

export function renderApp(path = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return { router, user: userEvent.setup() };
}
