import type { LocalDate, Trip } from '@/data/models';
import { compareTrips } from '@/data/rules/trip';
import { diffDays } from '@/lib/dates';

export type TripPhase = 'upcoming' | 'ongoing' | 'past';

type TripDates = Pick<Trip, 'startDate' | 'endDate'>;

export function tripPhase(trip: TripDates, today: LocalDate): TripPhase {
  if (today < trip.startDate) return 'upcoming';
  if (today > trip.endDate) return 'past';
  return 'ongoing';
}

/** `D-8`, `여행 중 · 2일차`, `지난 여행`. */
export function tripPhaseLabel(trip: TripDates, today: LocalDate): string {
  switch (tripPhase(trip, today)) {
    case 'upcoming':
      return `D-${diffDays(today, trip.startDate)}`;
    case 'ongoing':
      return `여행 중 · ${diffDays(trip.startDate, today) + 1}일차`;
    case 'past':
      return '지난 여행';
  }
}

/**
 * Ongoing and upcoming trips soonest first; past trips most recent first. `next` is the first of
 * `current` when there are other trips to pick it out from (the big card); a lone trip is a row.
 */
export function splitTrips(
  trips: Trip[],
  today: LocalDate,
): { current: Trip[]; past: Trip[]; next: Trip | null } {
  const sorted = [...trips].sort(compareTrips);
  const current = sorted.filter((trip) => tripPhase(trip, today) !== 'past');
  return {
    current,
    past: sorted.filter((trip) => tripPhase(trip, today) === 'past').reverse(),
    next: trips.length > 1 ? (current[0] ?? null) : null,
  };
}
