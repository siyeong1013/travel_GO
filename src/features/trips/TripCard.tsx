import { Link } from 'react-router';
import type { LocalDate, Trip } from '@/data/models';
import { coverInitial, coverStyle } from '@/features/trips/tripCover';
import { tripPhase, tripPlacesText } from '@/features/trips/tripDisplay';
import { TripPhaseBadge } from '@/features/trips/TripPhaseBadge';
import { formatDateRange, formatTripLength } from '@/lib/format';

interface TripCardProps {
  trip: Trip;
  today: LocalDate;
}

const dates = (trip: Trip, today: LocalDate) =>
  `${formatDateRange(trip.startDate, trip.endDate, today)} · ${formatTripLength(trip.startDate, trip.endDate)}`;

/** A trip as a row: a small cover (its photo, or the city's first letter), title, city and dates. */
export function TripCard({ trip, today }: TripCardProps) {
  const past = tripPhase(trip, today) === 'past';
  const faded = past ? 'opacity-60' : '';

  return (
    <Link
      to={`/trips/${trip.id}`}
      className="-mx-2 flex items-center gap-3.5 rounded-2xl px-2 py-2.5 active:bg-gray-50"
    >
      {trip.cover ? (
        <img
          src={trip.cover.thumbnail}
          alt=""
          className={`size-14 shrink-0 rounded-2xl object-cover ring-1 ring-black/5 ${faded}`}
        />
      ) : (
        <span
          aria-hidden="true"
          style={coverStyle(trip)}
          className={`flex size-14 shrink-0 items-center justify-center rounded-2xl text-xl font-bold text-white ${faded}`}
        >
          {coverInitial(trip)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="min-w-0 truncate text-base font-bold">{trip.title}</h3>
          {/* Past trips are already grouped under "지난 여행", so they skip the badge. */}
          {!past && <TripPhaseBadge trip={trip} today={today} />}
        </div>
        <p className="mt-0.5 truncate text-sm text-gray-500">{tripPlacesText(trip)}</p>
        <p className="text-sm text-gray-500">{dates(trip, today)}</p>
      </div>
    </Link>
  );
}
