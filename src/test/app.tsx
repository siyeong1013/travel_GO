// Helpers for screen-flow tests. The test file must mock '@/data' with test repositories
// (vi.mock is hoisted per file, so it cannot live here).
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { routes } from '@/app/router';
import { repositories } from '@/data';
import { createBackupFile } from '@/data/rules/backupFormat';
import { expenseStore } from '@/features/expenses/expenseStore';
import { rateStore } from '@/features/expenses/rateStore';
import { scheduleStore } from '@/features/schedule/scheduleStore';
import { tripStore } from '@/features/trips/tripStore';
import { emptyData, T0 } from '@/test/fixtures';
import { type FakePlace, fakePlacesApi, type FakePlacesOptions } from '@/test/places';

/** Simulates a fresh page load: empty stores, data only in IndexedDB (and localStorage). */
export function resetStores() {
  tripStore.setState(tripStore.getInitialState(), true);
  scheduleStore.setState(scheduleStore.getInitialState(), true);
  expenseStore.setState(expenseStore.getInitialState(), true);
  rateStore.setState(rateStore.getInitialState(), true);
}

/** Empties the stores, the database and localStorage (exchange rates kept on the device). */
export async function resetApp() {
  resetStores();
  localStorage.clear();
  await repositories.backup.importAll(createBackupFile(emptyData(), T0), 'overwrite');
}

/**
 * Puts the exchange-rate API online for this test, answering `respond()` (e.g. a
 * `latestRatesBody`). Returns the `fetch` mock. Without it the API looks offline.
 */
export function stubRatesApi(respond: () => unknown | Promise<unknown>) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    const body = await respond();
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

/**
 * Puts place search online for this test: an API key, and a fake Places API that knows `places`
 * (`test/places.ts`). Returns its request log. Without it there is no key and no search.
 */
export function stubPlacesApi(places: FakePlace[], options?: FakePlacesOptions) {
  const api = fakePlacesApi(places, options);
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
  vi.stubGlobal('google', { maps: { importLibrary: async () => api.library } });
  return api;
}

export function renderApp(path = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return { router, user: userEvent.setup() };
}
