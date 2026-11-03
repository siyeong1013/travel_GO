import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from '@/app/router';
import { repositories } from '@/data';
import { requestPersistentStorage } from '@/lib/storage';
import './index.css';

void requestPersistentStorage().then((status) => {
  console.info(`[travel GO] persistent storage: ${status}`);
});

// Google's place data may be kept for 30 days: remove older copies (data/rules/placeData).
Promise.all([repositories.trips.expirePlaceData(), repositories.schedule.expirePlaceData()]).catch(
  (error: unknown) => console.error(error),
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

// Dev only: poke the data layer from the browser console, e.g. `await travelGo.trips.list()`.
if (import.meta.env.DEV) {
  Object.assign(window, { travelGo: repositories });
}
