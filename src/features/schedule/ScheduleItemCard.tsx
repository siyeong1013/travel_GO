import { type ReactNode, useId } from 'react';
import { CheckIcon, PlaneIcon } from '@/components/ui/icons';
import type { ScheduleItem } from '@/data/models';
import { directionsUrl, distanceMeters, type RouteLeg } from '@/features/map/route';
import { flightDetails, flightHeading, isFlightItem } from '@/features/schedule/flightItem';
import { useLongPress } from '@/features/schedule/useLongPress';
import { formatDistance } from '@/lib/format';

interface ScheduleItemCardProps {
  item: ScheduleItem;
  /**
   * The place's number in the day (`itemNumbers`); null in the inbox, which has no itinerary
   * order, and for a flight, which shows a plane instead.
   */
  number: number | null;
  /** Whether the day's map shows the item's place up close: its number has a halo. */
  focused?: boolean;
  /** The day's timeline line to the item above, and to the one below. */
  joinedAbove?: boolean;
  joinedBelow?: boolean;
  /** The way to the next place with a location, shown under the card (see `legsAbove`). */
  leg?: RouteLeg;
  /** Keeps the leg's room but hides it (out of date while an item is dragged). */
  legHidden?: boolean;
  onClick: () => void;
  /** A finger held on the card (the edit mode, with this item picked). */
  onLongPress?: () => void;
  /** In the schedule's edit mode: whether the item is picked, and picking it (or not). */
  pick?: { checked: boolean; onChange: () => void } | null;
  /** Drag handle shown at the right edge in the edit mode (a button of its own: not in the card). */
  handle?: ReactNode;
}

/**
 * One item on the day's timeline: its number on a line through the day (a dot in the inbox, a
 * plane for a flight), the card, and under it the straight-line distance and directions to the
 * next place. A flight looked up heads its card with where and when it leaves and lands, then the
 * airline and the number. In the edit mode a round box to pick it takes the line's place (the card
 * picks it too, its number in it), and the drag handle shows.
 */
export function ScheduleItemCard({
  item,
  number,
  focused = false,
  joinedAbove = false,
  joinedBelow = false,
  leg,
  legHidden = false,
  onClick,
  onLongPress,
  pick = null,
  handle,
}: ScheduleItemCardProps) {
  const longPress = useLongPress(() => onLongPress?.());
  const boxId = useId();
  const flight = isFlightItem(item);
  const badge =
    pick &&
    (flight ? (
      <span className={badgeClass}>
        <PlaneIcon width={11} height={11} />
      </span>
    ) : (
      number !== null && <span className={badgeClass}>{number}</span>
    ));
  const content = (
    <>
      {item.flight ? (
        <>
          <span className="flex items-baseline gap-2">
            {badge}
            <span className="min-w-0 flex-1 truncate font-semibold tabular-nums">
              {flightHeading(item.flight, item.time)}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-sm text-gray-500">
            {flightDetails(item.flight)}
          </span>
        </>
      ) : (
        <>
          <span className="flex items-baseline gap-2">
            {badge}
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
        </>
      )}
      {item.memo && (
        <span className="mt-1 line-clamp-2 text-sm whitespace-pre-line text-gray-600">
          {item.memo}
        </span>
      )}
    </>
  );

  return (
    <div
      className="flex gap-3"
      // The click a long press may end with is not a tap: it would undo the pick it made.
      onClickCapture={(event) => {
        if (!longPress.endsLongPress()) return;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {pick ? (
        // The circle's center is 28px down, level with the card's first line.
        <label className="relative flex w-7 shrink-0 cursor-pointer justify-center pt-[17px]">
          <input
            id={boxId}
            type="checkbox"
            checked={pick.checked}
            onChange={pick.onChange}
            aria-label={item.place.name}
            className="peer size-[22px] cursor-pointer appearance-none rounded-full border-2 border-gray-300 bg-white transition-colors checked:border-brand-500 checked:bg-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          />
          <CheckIcon
            width={14}
            height={14}
            strokeWidth={3}
            className="pointer-events-none absolute top-[21px] text-white opacity-0 peer-checked:opacity-100"
          />
        </label>
      ) : (
        <div aria-hidden="true" className="relative flex w-7 shrink-0 justify-center">
          {joinedAbove && <span className="absolute top-0 h-7 w-0.5 bg-gray-200" />}
          {joinedBelow && <span className="absolute top-7 bottom-0 w-0.5 bg-gray-200" />}
          {flight ? (
            <span className="relative mt-3.5 flex size-7 items-center justify-center rounded-full bg-brand-500 text-white ring-4 ring-white">
              <PlaneIcon width={15} height={15} />
            </span>
          ) : number === null ? (
            <span className="relative mt-[23px] size-2.5 rounded-full bg-gray-300" />
          ) : (
            <span
              className={`relative mt-3.5 flex size-7 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white ring-4 transition-shadow ${focused ? 'ring-brand-100' : 'ring-white'}`}
            >
              {number}
            </span>
          )}
        </div>
      )}
      <div className="min-w-0 flex-1 pb-3">
        <div
          className={`flex items-stretch rounded-2xl border shadow-sm transition-colors ${
            pick?.checked ? 'border-brand-100 bg-brand-50' : 'border-gray-100 bg-white'
          }`}
        >
          {pick ? (
            <label
              htmlFor={boxId}
              className="min-w-0 flex-1 cursor-pointer rounded-l-2xl p-3.5 text-left select-none"
            >
              {content}
            </label>
          ) : (
            <button
              type="button"
              onClick={onClick}
              {...longPress.handlers}
              // A long press picks it: no text selection or callout on the way.
              className="min-w-0 flex-1 rounded-2xl p-3.5 text-left select-none [-webkit-touch-callout:none] active:bg-gray-50"
            >
              {content}
            </button>
          )}
          {pick && handle}
        </div>
        {!pick && leg && <LegLine leg={leg} hidden={legHidden} />}
      </div>
    </div>
  );
}

/** A picked item's number (or plane) in its card. */
const badgeClass =
  'flex size-5 shrink-0 items-center justify-center self-center rounded-full bg-gray-100 text-[11px] font-bold text-gray-500';

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
