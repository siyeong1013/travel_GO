import { Outlet } from 'react-router';

/** Mobile-width column; centered on wider screens. */
export function AppLayout() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-white shadow-sm">
      <Outlet />
    </div>
  );
}
