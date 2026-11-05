import { useEffect } from 'react';
import { Outlet } from 'react-router';
import { hideSplash } from '@/app/splash';
import { countryStore } from '@/features/countries/countryStore';
import { startSync } from '@/features/sync/syncStore';
import { useNoForwardHistory } from '@/lib/useNoForwardHistory';

/** Mobile-width column; centered on wider screens. */
export function AppLayout() {
  // The app has drawn: the start screen can go, and the signed-in account's trips start syncing.
  // Trips that began since it was last open put their countries on "다녀온 나라".
  useEffect(() => {
    void hideSplash();
    startSync();
    void countryStore.getState().markTrips();
  }, []);
  useNoForwardHistory();

  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-white shadow-sm">
      <Outlet />
    </div>
  );
}
