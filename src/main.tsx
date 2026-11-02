import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from '@/app/router';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

// Dev only: poke the data layer from the browser console, e.g. `await travelGo.trips.list()`.
if (import.meta.env.DEV) {
  void import('@/data').then(({ repositories }) => Object.assign(window, { travelGo: repositories }));
}
