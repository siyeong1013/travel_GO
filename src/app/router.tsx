import { createBrowserRouter } from 'react-router';
import { AppLayout } from '@/app/AppLayout';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { TripCreatePage } from '@/pages/TripCreatePage';
import { TripDetailPage } from '@/pages/TripDetailPage';
import { TripListPage } from '@/pages/TripListPage';

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <TripListPage /> },
      { path: 'trips/new', element: <TripCreatePage /> },
      { path: 'trips/:tripId', element: <TripDetailPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
