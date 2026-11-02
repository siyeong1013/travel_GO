import { Link } from 'react-router';
import { MapPinIcon } from '@/components/ui/icons';
import type { LocalDate, Trip } from '@/data/models';
import { tripPhase } from '@/features/trips/tripDisplay';
import { TripPhaseBadge } from '@/features/trips/TripPhaseBadge';
import { formatDateRange, formatTripLength } from '@/lib/format';

export function TripCard({ trip, today }: { trip: Trip; today: LocalDate }) {
  // Past trips are already grouped under "지난 여행", so they skip the badge.
  const showBadge = tripPhase(trip, today) !== 'past';

  return (
    <Link
      to={`/trips/${trip.id}`}
      className="block rounded-2xl border border-gray-100 bg-white p-4 shadow-sm active:bg-gray-50"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 truncate text-base font-bold">{trip.title}</h3>
        {showBadge && <TripPhaseBadge trip={trip} today={today} />}
      </div>
      <p className="mt-1.5 flex items-center gap-1 text-sm text-gray-600">
        <MapPinIcon width={14} height={14} className="shrink-0 text-gray-400" />
        <span className="truncate">{trip.city.name}</span>
      </p>
      <p className="mt-0.5 text-sm text-gray-500">
        {formatDateRange(trip.startDate, trip.endDate, today)} ·{' '}
        {formatTripLength(trip.startDate, trip.endDate)}
      </p>
    </Link>
  );
}
