import { MapPinIcon } from '@/components/ui/icons';
import type { LocalDate, Trip } from '@/data/models';
import { TripPhaseBadge } from '@/features/trips/TripPhaseBadge';
import { formatDateRange, formatTripLength } from '@/lib/format';

export function TripSummary({ trip, today }: { trip: Trip; today: LocalDate }) {
  return (
    <section className="px-4 pt-4 pb-1">
      <div className="flex items-center gap-2">
        <TripPhaseBadge trip={trip} today={today} />
        <p className="flex min-w-0 items-center gap-1 text-sm text-gray-600">
          <MapPinIcon width={14} height={14} className="shrink-0 text-gray-400" />
          <span className="truncate">{trip.city.name}</span>
        </p>
      </div>
      <p className="mt-2 text-base font-semibold">
        {formatDateRange(trip.startDate, trip.endDate, today)} ·{' '}
        {formatTripLength(trip.startDate, trip.endDate)}
      </p>
    </section>
  );
}
