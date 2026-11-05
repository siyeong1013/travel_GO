import type { Ref } from 'react';
import type { LocalDate, Trip } from '@/data/models';
import { coverBadgeClass, coverStyle, photoTextShade } from '@/features/trips/tripCover';
import { tripPhaseLabel, tripPlacesText } from '@/features/trips/tripDisplay';
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
 * title (the page's heading) and the dates, on the trip's photo (taller, text at the bottom) or
 * its cover color.
 */
export function TripCover({ trip, today, startRef, endRef }: TripCoverProps) {
  return (
    <section
      style={trip.cover ? undefined : coverStyle(trip)}
      className={`relative -mt-[calc(3.5rem_+_env(safe-area-inset-top))] flex flex-col justify-end pt-[calc(3.5rem_+_env(safe-area-inset-top)_+_1.5rem)] text-white ${
        trip.cover ? 'min-h-[calc(3.5rem_+_env(safe-area-inset-top)_+_17rem)]' : ''
      }`}
    >
      {trip.cover && (
        <>
          <img src={trip.cover.image} alt="" className="absolute inset-0 size-full object-cover" />
          {/* Under the header's white icons (and the status bar). */}
          <div className="absolute inset-x-0 top-0 h-[calc(env(safe-area-inset-top)_+_9rem)] bg-linear-to-b from-black/55 to-transparent" />
        </>
      )}
      <div
        style={trip.cover ? photoTextShade : undefined}
        className={`relative px-5 pb-7 ${trip.cover ? 'pt-16' : ''}`}
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${coverBadgeClass(trip.cover !== null)}`}
          >
            {tripPhaseLabel(trip, today)}
          </span>
          <span className="truncate">{tripPlacesText(trip)}</span>
        </div>
        <h1 className="mt-3 text-[26px] leading-tight font-bold break-keep">{trip.title}</h1>
        <p className="mt-1.5 text-[15px] font-medium">
          {formatDateRange(trip.startDate, trip.endDate, today)} ·{' '}
          {formatTripLength(trip.startDate, trip.endDate)}
        </p>
      </div>
      <div
        ref={startRef}
        aria-hidden="true"
        className="absolute inset-x-0 top-[calc(3.5rem_+_env(safe-area-inset-top))] h-px"
      />
      <div ref={endRef} aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px" />
    </section>
  );
}
