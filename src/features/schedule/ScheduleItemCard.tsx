import type { ReactNode } from 'react';
import type { ScheduleItem } from '@/data/models';
import { directionsUrl, distanceMeters, type RouteLeg } from '@/features/map/route';
import { formatDistance } from '@/lib/format';

interface ScheduleItemCardProps {
  item: ScheduleItem;
  /** Position in the day (1-based); null in the inbox, which has no itinerary order. */
  number: number | null;
  /** The day's timeline line to the item above, and to the one below. */
  joinedAbove?: boolean;
  joinedBelow?: boolean;
  /** The way to the next place with a location, shown under the card (see `legsAbove`). */
  leg?: RouteLeg;
  /** Keeps the leg's room but hides it (out of date while an item is dragged). */
  legHidden?: boolean;
  onClick: () => void;
  /** Drag handle shown at the right edge (a separate button, so it can't nest in the card). */
  handle?: ReactNode;
}

/**
 * One item on the day's timeline: its number on a line through the day (a dot in the inbox),
 * the card, and under it the straight-line distance and directions to the next place.
 */
export function ScheduleItemCard({
  item,
  number,
  joinedAbove = false,
  joinedBelow = false,
  leg,
  legHidden = false,
  onClick,
  handle,
}: ScheduleItemCardProps) {
  return (
    <div className="flex gap-3">
      {/* The circle's center is 28px down, level with the card's first line. */}
      <div aria-hidden="true" className="relative flex w-7 shrink-0 justify-center">
        {joinedAbove && <span className="absolute top-0 h-7 w-0.5 bg-gray-200" />}
        {joinedBelow && <span className="absolute top-7 bottom-0 w-0.5 bg-gray-200" />}
        {number === null ? (
          <span className="relative mt-[23px] size-2.5 rounded-full bg-gray-300" />
        ) : (
          <span className="relative mt-3.5 flex size-7 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white ring-4 ring-white">
            {number}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 pb-3">
        <div className="flex items-stretch rounded-2xl border border-gray-100 bg-white shadow-sm">
          <button
            type="button"
            onClick={onClick}
            className="min-w-0 flex-1 rounded-l-2xl p-3.5 text-left last:rounded-r-2xl active:bg-gray-50"
          >
            <span className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate font-semibold">{item.place.name}</span>
              {item.time && (
                <span className="shrink-0 text-sm font-semibold text-brand-600 tabular-nums">
                  {item.time}
                </span>
              )}
            </span>
            {item.place.address && (
              <span className="mt-0.5 block truncate text-sm text-gray-500">
                {item.place.address}
              </span>
            )}
            {item.memo && (
              <span className="mt-1 line-clamp-2 text-sm whitespace-pre-line text-gray-600">
                {item.memo}
              </span>
            )}
          </button>
          {handle}
        </div>
        {leg && <LegLine leg={leg} hidden={legHidden} />}
      </div>
    </div>
  );
}

function LegLine({ leg, hidden }: { leg: RouteLeg; hidden: boolean }) {
  // Under items without a location, the leg says where it starts.
  const from = leg.to.number - leg.from.number > 1 ? `${leg.from.number}번에서 ` : '';
  return (
    <p className={`flex items-center gap-1 pt-2 pl-1 text-[13px] text-gray-500 ${hidden ? 'invisible' : ''}`}>
      <span>
        {from}직선 {formatDistance(distanceMeters(leg.from.location, leg.to.location))}
      </span>
      <span aria-hidden="true">·</span>
      <a
        href={directionsUrl(leg)}
        target="_blank"
        rel="noreferrer"
        aria-label={`${leg.from.number}번 ${leg.from.name}에서 ${leg.to.number}번 ${leg.to.name}까지 길찾기`}
        className="-my-3 flex h-11 items-center rounded-lg px-1.5 font-semibold text-brand-600 active:bg-brand-50"
      >
        길찾기
      </a>
    </p>
  );
}
