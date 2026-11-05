import type { ComponentType } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppLayout } from '@/app/AppLayout';
import { RouteError } from '@/app/RouteError';
import { reloadingForChunk } from '@/lib/chunkErrors';
import { watchOwnHistorySteps } from '@/lib/useNoForwardHistory';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { TripListPage } from '@/pages/TripListPage';

/**
 * A screen whose code loads when it's first opened. (`lazy` as a function: React Router marks the
 * object form's loaded parts on the object itself, which these routes share with every router
 * made from them, as the tests make one each.)
 */
function lazyPage<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return async () => {
    try {
      return { Component: (await load())[name] };
    } catch (error) {
      // Its chunk is gone and the page is reloading into it: stay on this screen till then.
      if (reloadingForChunk()) return new Promise<never>(() => {});
      throw error;
    }
  };
}

// Screens other than the trip list load their code when first opened, so the app starts with
// less of it (the service worker still keeps all of it for offline use).
export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    // While the first screen's code loads: the empty column.
    hydrateFallbackElement: <AppLayout />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          { index: true, element: <TripListPage /> },
          {
            path: 'trips/new',
            lazy: lazyPage(() => import('@/pages/TripCreatePage'), 'TripCreatePage'),
          },
          {
            path: 'trips/:tripId',
            lazy: lazyPage(() => import('@/pages/TripDetailPage'), 'TripDetailPage'),
          },
          {
            path: 'trips/:tripId/edit',
            lazy: lazyPage(() => import('@/pages/TripEditPage'), 'TripEditPage'),
          },
          {
            path: 'trips/:tripId/expenses/new',
            lazy: lazyPage(() => import('@/pages/ExpenseCreatePage'), 'ExpenseCreatePage'),
          },
          {
            path: 'trips/:tripId/expenses/summary',
            lazy: lazyPage(() => import('@/pages/ExpenseSummaryPage'), 'ExpenseSummaryPage'),
          },
          {
            path: 'trips/:tripId/expenses/settlement',
            lazy: lazyPage(() => import('@/pages/SettlementPage'), 'SettlementPage'),
          },
          {
            path: 'trips/:tripId/expenses/:expenseId',
            lazy: lazyPage(() => import('@/pages/ExpenseEditPage'), 'ExpenseEditPage'),
          },
          {
            path: 'trips/:tripId/people',
            lazy: lazyPage(() => import('@/pages/TripPeoplePage'), 'TripPeoplePage'),
          },
          { path: 'join/:token', lazy: lazyPage(() => import('@/pages/JoinPage'), 'JoinPage') },
          { path: 'settings', lazy: lazyPage(() => import('@/pages/SettingsPage'), 'SettingsPage') },
          { path: 'account', lazy: lazyPage(() => import('@/pages/AccountPage'), 'AccountPage') },
          {
            path: 'countries',
            lazy: lazyPage(() => import('@/pages/CountriesPage'), 'CountriesPage'),
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

// Before the router listens to popstate, so the app's own steps through history stay unseen by it.
watchOwnHistorySteps();
export const router = createBrowserRouter(routes);
