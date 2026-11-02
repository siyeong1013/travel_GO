import { describe, expect, it } from 'vitest';
import { splitTrips, tripPhaseLabel } from '@/features/trips/tripDisplay';
import { makeTrip } from '@/test/fixtures';

describe('tripPhaseLabel', () => {
  const trip = { startDate: '2026-11-10', endDate: '2026-11-12' };

  it('counts down, then counts the days of the trip', () => {
    expect(tripPhaseLabel(trip, '2026-11-02')).toBe('D-8');
    expect(tripPhaseLabel(trip, '2026-11-10')).toBe('여행 중 · 1일차');
    expect(tripPhaseLabel(trip, '2026-11-12')).toBe('여행 중 · 3일차');
    expect(tripPhaseLabel(trip, '2026-11-13')).toBe('지난 여행');
  });
});

describe('splitTrips', () => {
  it('lists current trips soonest first and past trips most recent first', () => {
    const trips = [
      makeTrip({ title: 'december', startDate: '2026-12-01', endDate: '2026-12-03' }),
      makeTrip({ title: 'early-october', startDate: '2026-10-01', endDate: '2026-10-03' }),
      makeTrip({ title: 'ongoing', startDate: '2026-11-01', endDate: '2026-11-05' }),
      makeTrip({ title: 'late-october', startDate: '2026-10-20', endDate: '2026-10-22' }),
    ];

    const { current, past } = splitTrips(trips, '2026-11-02');

    expect(current.map((trip) => trip.title)).toEqual(['ongoing', 'december']);
    expect(past.map((trip) => trip.title)).toEqual(['late-october', 'early-october']);
  });
});
