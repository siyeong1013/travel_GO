// Helpers for screen-flow tests. The test file must mock '@/data' with test repositories
// (vi.mock is hoisted per file, so it cannot live here).
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, type RouteObject, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { routes } from '@/app/router';
import { repositories } from '@/data';
import { createBackupFile } from '@/data/rules/backupFormat';
import { accountStore } from '@/features/account/accountStore';
import { backupStore } from '@/features/backup/backupStore';
import { expenseStore } from '@/features/expenses/expenseStore';
import { rateStore } from '@/features/expenses/rateStore';
import { scheduleStore } from '@/features/schedule/scheduleStore';
import { sharingStore } from '@/features/sharing/sharingStore';
import { syncStore } from '@/features/sync/syncStore';
import { tripStore } from '@/features/trips/tripStore';
import { emptyData, T0 } from '@/test/fixtures';
import { fakeMapsApi } from '@/test/maps';
import { type FakePlace, fakePlacesApi, type FakePlacesOptions } from '@/test/places';

/** The loaders of every screen whose code comes in when it's first opened (`app/router.tsx`). */
function screenLoaders(list: RouteObject[]): (() => Promise<unknown>)[] {
  return list.flatMap((route) => [
    ...(typeof route.lazy === 'function' ? [route.lazy] : []),
    ...screenLoaders(route.children ?? []),
  ]);
}

// Load every screen's code with the test file, so a test doesn't wait on it while finding its
// first screen (under load that can outlast `findBy*`). A test may make one fail to load.
await Promise.allSettled(screenLoaders(routes).map((load) => load()));

/** Simulates a fresh page load: empty stores, data only in IndexedDB (and localStorage). */
export function resetStores() {
  tripStore.setState(tripStore.getInitialState(), true);
  scheduleStore.setState(scheduleStore.getInitialState(), true);
  expenseStore.setState(expenseStore.getInitialState(), true);
  rateStore.setState(rateStore.getInitialState(), true);
  backupStore.setState(backupStore.getInitialState(), true);
  accountStore.setState(accountStore.getInitialState(), true);
  syncStore.setState(syncStore.getInitialState(), true);
  sharingStore.setState(sharingStore.getInitialState(), true);
}

/**
 * A Supabase project for this test, so the app has a login. The test file mocks
 * '@supabase/supabase-js' to answer with `supabaseFake` (`test/supabase.ts`).
 */
export function stubSupabase() {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
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

/** An API key, and a fake Maps JavaScript API on the page that serves `libraries` by name. */
function stubGoogleMaps(libraries: Record<string, unknown>) {
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
  vi.stubGlobal('google', {
    maps: {
      importLibrary: async (name: string) => {
        if (!(name in libraries)) throw new Error(`no fake "${name}" library`);
        return libraries[name];
      },
    },
  });
}

/**
 * Puts place search online for this test: an API key, and a fake Places API that knows `places`
 * (`test/places.ts`). Returns its request log. Without it there is no key and no search.
 * Days with found places show a (fake) map as well.
 */
export function stubPlacesApi(places: FakePlace[], options?: FakePlacesOptions) {
  const api = fakePlacesApi(places, options);
  stubGoogleMaps({ places: api.library, ...fakeMapsApi().libraries });
  return api;
}

/** Puts the map online for this test (`test/maps.ts`): returns what it draws. */
export function stubMapsApi() {
  const api = fakeMapsApi();
  stubGoogleMaps(api.libraries);
  return api;
}

export function renderApp(path = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return { router, user: userEvent.setup() };
}
