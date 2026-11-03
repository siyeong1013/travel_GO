import { Link } from 'react-router';
import type { LocalDate, Trip } from '@/data/models';
import { coverInitial, coverStyle } from '@/features/trips/tripCover';
import { tripPhase, tripPhaseLabel } from '@/features/trips/tripDisplay';
import { TripPhaseBadge } from '@/features/trips/TripPhaseBadge';
import { formatDateRange, formatTripLength } from '@/lib/format';

interface TripCardProps {
  trip: Trip;
  today: LocalDate;
}

const dates = (trip: Trip, today: LocalDate) =>
  `${formatDateRange(trip.startDate, trip.endDate, today)} · ${formatTripLength(trip.startDate, trip.endDate)}`;

/** The next trip, large: its cover with how soon it is, the city, title and dates. */
export function TripHeroCard({ trip, today }: TripCardProps) {
  return (
    <Link
      to={`/trips/${trip.id}`}
      style={coverStyle(trip)}
      className="block rounded-3xl p-5 text-white shadow-lg shadow-gray-900/10 active:opacity-90"
    >
      <span className="inline-flex rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold">
        {tripPhaseLabel(trip, today)}
      </span>
      <p className="mt-10 truncate text-sm font-semibold">{trip.city.name}</p>
      <h3 className="mt-0.5 truncate text-2xl leading-tight font-bold">{trip.title}</h3>
      <p className="mt-1.5 text-sm font-medium">{dates(trip, today)}</p>
    </Link>
  );
}

/** A trip as a row: a small cover with the city's first letter, title, city and dates. */
export function TripCard({ trip, today }: TripCardProps) {
  const past = tripPhase(trip, today) === 'past';

  return (
    <Link
      to={`/trips/${trip.id}`}
      className="-mx-2 flex items-center gap-3.5 rounded-2xl px-2 py-2.5 active:bg-gray-50"
    >
      <span
        aria-hidden="true"
        style={coverStyle(trip)}
        className={`flex size-14 shrink-0 items-center justify-center rounded-2xl text-xl font-bold text-white ${past ? 'opacity-60' : ''}`}
      >
        {coverInitial(trip)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="min-w-0 truncate text-base font-bold">{trip.title}</h3>
          {/* Past trips are already grouped under "지난 여행", so they skip the badge. */}
          {!past && <TripPhaseBadge trip={trip} today={today} />}
        </div>
        <p className="mt-0.5 truncate text-sm text-gray-500">{trip.city.name}</p>
        <p className="text-sm text-gray-500">{dates(trip, today)}</p>
      </div>
    </Link>
  );
}
