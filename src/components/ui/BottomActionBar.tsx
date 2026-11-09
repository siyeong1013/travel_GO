import type { ReactNode, Ref } from 'react';

/** Sticky bar at the bottom of the screen for primary actions (thumb zone). */
export function BottomActionBar({
  children,
  ref,
}: {
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      className="pb-safe sticky bottom-0 z-10 mt-auto border-t border-gray-100 bg-white px-4 pt-3"
    >
      {children}
    </div>
  );
}
