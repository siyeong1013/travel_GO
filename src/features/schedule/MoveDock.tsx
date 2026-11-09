import type { Ref } from 'react';
import { InboxIcon } from '@/components/ui/icons';
import type { DayTab, GroupKey } from '@/features/schedule/dayTabs';

interface MoveDockProps {
  /** Every group except the one being shown. */
  targets: DayTab[];
  hovered: GroupKey | null;
  /** Whether the days show: the finger has reached the bar (`open`), or is still over the list. */
  open: boolean;
  ref?: Ref<HTMLDivElement>;
  /** The days themselves: what the item is dropped on, and what the list may not lay out under. */
  gridRef?: Ref<HTMLDivElement>;
}

/**
 * Drop targets for moving an item to another day, at the bottom (thumb zone) while dragging.
 * All targets are visible at once, unlike the horizontally scrolling day tabs.
 *
 * Only a bar until the finger reaches it, so that the list it is dragged in stays visible: a long
 * trip has enough days to cover it. The days then open above the bar, with the finger still on it.
 * Pointer-only, so hidden from assistive tech: the edit sheet's day select covers that.
 */
export function MoveDock({ targets, hovered, open, ref, gridRef }: MoveDockProps) {
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pb-safe animate-fade-in fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[430px] border-t border-gray-200 bg-white px-4 shadow-[0_-8px_24px_rgba(0,0,0,0.08)]"
    >
      {open && (
        <div ref={gridRef} className="grid grid-cols-5 gap-1.5 pt-3">
          {targets.map((target) => (
            <div
              key={target.key}
              data-drop-group={target.key}
              className={`flex h-12 flex-col items-center justify-center rounded-lg border-2 text-center leading-tight transition-colors ${
                hovered === target.key
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-dashed border-gray-300 text-gray-600'
              }`}
            >
              {target.date ? (
                <>
                  <span className="text-[11px] font-bold">{target.title}</span>
                  <span className="text-[10px] whitespace-nowrap">{target.subtitle}</span>
                </>
              ) : (
                <>
                  <InboxIcon width={14} height={14} />
                  <span className="text-[11px] font-bold">{target.title}</span>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="flex h-12 items-center justify-center text-xs font-semibold text-gray-500">
        {open ? '옮길 날짜 위에 놓으세요' : '다른 날로 옮기려면 여기로 끌어 오세요'}
      </p>
    </div>
  );
}
