import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from '@/app/router';
import { requestPersistentStorage } from '@/lib/storage';
import './index.css';

void requestPersistentStorage().then((status) => {
  console.info(`[travel GO] persistent storage: ${status}`);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

// Dev only: poke the data layer from the browser console, e.g. `await travelGo.trips.list()`.
if (import.meta.env.DEV) {
  void import('@/data').then(({ repositories }) => Object.assign(window, { travelGo: repositories }));
}
