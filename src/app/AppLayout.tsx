import { useEffect } from 'react';
import { Outlet } from 'react-router';
import { hideSplash } from '@/app/splash';

/** Mobile-width column; centered on wider screens. */
export function AppLayout() {
  // The app has drawn: the start screen can go.
  useEffect(() => void hideSplash(), []);

  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-white shadow-sm">
      <Outlet />
    </div>
  );
}
