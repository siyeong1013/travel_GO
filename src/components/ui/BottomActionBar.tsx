import type { ReactNode } from 'react';

/** Sticky bar at the bottom of the screen for primary actions (thumb zone). */
export function BottomActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="pb-safe sticky bottom-0 z-10 mt-auto border-t border-gray-100 bg-white px-4 pt-3">
      {children}
    </div>
  );
}
