import type { Ref } from 'react';
import type { LocalDate, Trip } from '@/data/models';
import { coverStyle } from '@/features/trips/tripCover';
import { tripPhaseLabel } from '@/features/trips/tripDisplay';
import { formatDateRange, formatTripLength } from '@/lib/format';

interface TripCoverProps {
  trip: Trip;
  today: LocalDate;
  /** Lines just under the header and at the bottom, for telling how far the cover has scrolled. */
  startRef?: Ref<HTMLDivElement>;
  endRef?: Ref<HTMLDivElement>;
}

/**
 * The top of the trip page, under the transparent header: how soon the trip is, the city, the
 * title (the page's heading) and the dates, on the trip's cover color.
 */
export function TripCover({ trip, today, startRef, endRef }: TripCoverProps) {
  return (
    <section
      style={coverStyle(trip)}
      className="relative -mt-[calc(3.5rem_+_env(safe-area-inset-top))] px-5 pt-[calc(3.5rem_+_env(safe-area-inset-top)_+_1.5rem)] pb-7 text-white"
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="shrink-0 rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold">
          {tripPhaseLabel(trip, today)}
        </span>
        <span className="truncate">{trip.city.name}</span>
      </div>
      <h1 className="mt-3 text-[26px] leading-tight font-bold break-keep">{trip.title}</h1>
      <p className="mt-1.5 text-[15px] font-medium">
        {formatDateRange(trip.startDate, trip.endDate, today)} ·{' '}
        {formatTripLength(trip.startDate, trip.endDate)}
      </p>
      <div
        ref={startRef}
        aria-hidden="true"
        className="absolute inset-x-0 top-[calc(3.5rem_+_env(safe-area-inset-top))] h-px"
      />
      <div ref={endRef} aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px" />
    </section>
  );
}
