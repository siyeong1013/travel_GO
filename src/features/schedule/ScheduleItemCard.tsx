import type { ScheduleItem } from '@/data/models';

interface ScheduleItemCardProps {
  item: ScheduleItem;
  /** Position in the day (1-based); null in the inbox, which has no itinerary order. */
  number: number | null;
  onClick: () => void;
}

export function ScheduleItemCard({ item, number, onClick }: ScheduleItemCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-2xl border border-gray-100 bg-white p-3.5 text-left shadow-sm active:bg-gray-50"
    >
      {number === null ? (
        <span aria-hidden="true" className="mx-2 mt-2 size-2.5 shrink-0 rounded-full bg-gray-300" />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white"
        >
          {number}
        </span>
      )}
      <span className="min-w-0 flex-1 pt-0.5">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate font-semibold">{item.place.name}</span>
          {item.time && (
            <span className="shrink-0 text-sm font-semibold text-brand-600 tabular-nums">
              {item.time}
            </span>
          )}
        </span>
        {item.place.address && (
          <span className="mt-0.5 block truncate text-sm text-gray-500">{item.place.address}</span>
        )}
        {item.memo && (
          <span className="mt-1 line-clamp-2 text-sm whitespace-pre-line text-gray-600">
            {item.memo}
          </span>
        )}
      </span>
    </button>
  );
}
