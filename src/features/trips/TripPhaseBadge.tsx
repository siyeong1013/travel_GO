import type { LocalDate, Trip } from '@/data/models';
import { type TripPhase, tripPhase, tripPhaseLabel } from '@/features/trips/tripDisplay';

const toneClass: Record<TripPhase, string> = {
  upcoming: 'bg-brand-50 text-brand-600',
  ongoing: 'bg-emerald-50 text-emerald-600',
  past: 'bg-gray-100 text-gray-500',
};

export function TripPhaseBadge({ trip, today }: { trip: Trip; today: LocalDate }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${toneClass[tripPhase(trip, today)]}`}
    >
      {tripPhaseLabel(trip, today)}
    </span>
  );
}
