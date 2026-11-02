import { type KeyboardEvent, useEffect, useRef } from 'react';
import { InboxIcon } from '@/components/ui/icons';
import { type DayTab, type GroupKey, tabElementId } from '@/features/schedule/dayTabs';

interface DayTabsProps {
  tabs: DayTab[];
  selected: GroupKey;
  onSelect: (key: GroupKey) => void;
  /** Prefix for tab element ids, see `tabElementId`. */
  idPrefix: string;
  panelId: string;
}

/** Horizontally scrolling day chips, with the inbox last. ARIA tabs; arrow keys move. */
export function DayTabs({ tabs, selected, onSelect, idPrefix, panelId }: DayTabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tab = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    tab?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [selected]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.key === selected);
    const targets: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: tabs.length - 1,
    };
    const target = targets[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const tab = tabs[(target + tabs.length) % tabs.length]!;
    onSelect(tab.key);
    document.getElementById(tabElementId(idPrefix, tab.key))?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="여행 날짜"
      onKeyDown={handleKeyDown}
      className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => {
        const isSelected = tab.key === selected;
        return (
          <button
            key={tab.key}
            id={tabElementId(idPrefix, tab.key)}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls={panelId}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onSelect(tab.key)}
            className={`relative flex min-h-14 shrink-0 flex-col items-center justify-center rounded-2xl px-4 py-1.5 transition-colors ${
              isSelected ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-700 active:bg-gray-200'
            }`}
          >
            {tab.date ? (
              <>
                <span className="text-xs font-bold">{tab.title}</span>
                <span className="text-sm font-medium whitespace-nowrap">{tab.subtitle}</span>
              </>
            ) : (
              <>
                <InboxIcon width={16} height={16} />
                <span className="text-sm font-medium">{tab.title}</span>
              </>
            )}
            {tab.count > 0 && (
              <span
                className={`absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold ${
                  isSelected ? 'bg-gray-900 text-white' : 'bg-brand-500 text-white'
                }`}
              >
                <span className="sr-only">일정 </span>
                {tab.count}
                <span className="sr-only">개</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
