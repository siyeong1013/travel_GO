import type { Ref } from 'react';
import { InboxIcon } from '@/components/ui/icons';
import type { DayTab, GroupKey } from '@/features/schedule/dayTabs';

interface MoveDockProps {
  /** Every group except the one being shown. */
  targets: DayTab[];
  hovered: GroupKey | null;
  ref?: Ref<HTMLDivElement>;
}

/**
 * Drop targets for moving an item to another day, shown at the bottom (thumb zone) while
 * dragging. All targets are visible at once, unlike the horizontally scrolling day tabs.
 * Pointer-only, so hidden from assistive tech: the edit sheet's day select covers that.
 */
export function MoveDock({ targets, hovered, ref }: MoveDockProps) {
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pb-safe animate-fade-in fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[430px] border-t border-gray-200 bg-white px-4 pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)]"
    >
      <p className="mb-2 text-xs font-semibold text-gray-500">다른 날로 옮기려면 여기에 놓으세요</p>
      <div className="grid grid-cols-4 gap-2">
        {targets.map((target) => (
          <div
            key={target.key}
            data-drop-group={target.key}
            className={`flex h-14 flex-col items-center justify-center rounded-xl border-2 text-center transition-colors ${
              hovered === target.key
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-dashed border-gray-300 text-gray-600'
            }`}
          >
            {target.date ? (
              <>
                <span className="text-xs font-bold">{target.title}</span>
                <span className="text-[11px] whitespace-nowrap">{target.subtitle}</span>
              </>
            ) : (
              <>
                <InboxIcon width={16} height={16} />
                <span className="text-xs font-bold">{target.title}</span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
