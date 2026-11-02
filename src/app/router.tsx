import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppLayout } from '@/app/AppLayout';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { TripCreatePage } from '@/pages/TripCreatePage';
import { TripDetailPage } from '@/pages/TripDetailPage';
import { TripEditPage } from '@/pages/TripEditPage';
import { TripListPage } from '@/pages/TripListPage';

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <TripListPage /> },
      { path: 'trips/new', element: <TripCreatePage /> },
      { path: 'trips/:tripId', element: <TripDetailPage /> },
      { path: 'trips/:tripId/edit', element: <TripEditPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
