import type { Trip } from '@/data/models';
import type { NewScheduleItem } from '@/data/repositories';
import { flightItem, flightNumberItem } from '@/features/schedule/flightItem';
import type { FlightLookup } from '@/features/schedule/flightLookup';
import { isDateInRange, isLocalDate } from '@/lib/dates';
import { type FlightLeg, parseFlightNumber } from '@/lib/flights';

/**
 * A flight typed by its number and day (a new trip's, or the schedule's flight sheet): looked up,
 * it goes into the schedule on the day it leaves.
 */
export interface FlightDraft {
  /** Tells the rows apart while they come and go. */
  key: number;
  number: string;
  /** `YYYY-MM-DD`, or empty. */
  date: string;
  /** The answer for a number on a day, once asked (null while asking). */
  lookup: { number: string; date: string; result: FlightLookup | null } | null;
  /** Which of the flights found is the one taken (a number can fly several legs a day). */
  leg: number;
}

/** The lookup of the row as it reads now (one for other text or another day is old). */
export function currentLookup(flight: FlightDraft): FlightDraft['lookup'] {
  const { lookup } = flight;
  return lookup && lookup.number === parseFlightNumber(flight.number) && lookup.date === flight.date
    ? lookup
    : null;
}

/** The flights found for the row as it reads now. */
export function foundLegs(flight: FlightDraft): FlightLeg[] {
  const result = currentLookup(flight)?.result;
  return result?.status === 'ok' ? result.flights : [];
}

/** The flight taken of those found: the one picked, the first to begin with. */
export function chosenLeg(flight: FlightDraft): FlightLeg | null {
  const legs = foundLegs(flight);
  return legs[flight.leg] ?? legs[0] ?? null;
}

/** Whether the row has a number and a day with no answer for them yet. */
export function awaitingLookup(flight: FlightDraft): boolean {
  return (
    parseFlightNumber(flight.number) !== null &&
    isLocalDate(flight.date) &&
    !currentLookup(flight)?.result
  );
}

/** The rows with row `key` asking for `number` on `date`. */
export function asking(
  flights: FlightDraft[],
  key: number,
  number: string,
  date: string,
): FlightDraft[] {
  return flights.map((row) =>
    row.key === key ? { ...row, lookup: { number, date, result: null }, leg: 0 } : row,
  );
}

/** The rows with the answer for row `key`, unless it was asked something else meanwhile. */
export function answered(
  flights: FlightDraft[],
  key: number,
  number: string,
  date: string,
  result: FlightLookup,
): FlightDraft[] {
  return flights.map((row) =>
    row.key === key && row.lookup?.number === number && row.lookup.date === date
      ? { ...row, lookup: { number, date, result } }
      : row,
  );
}

/**
 * What flights put in a trip's schedule: each one found on the day it leaves, at its airport
 * (`flightItem`; the leg picked, of several); one not found by its number on its day; in the
 * inbox when that day is outside the trip. Rows without a flight number are left out.
 */
export function flightScheduleItems(
  flights: FlightDraft[],
  trip: Pick<Trip, 'id' | 'countries' | 'startDate' | 'endDate'>,
): NewScheduleItem[] {
  const onTrip = (date: string | null) =>
    date && isLocalDate(date) && isDateInRange(date, trip.startDate, trip.endDate) ? date : null;
  return flights.flatMap((flight): NewScheduleItem[] => {
    const number = parseFlightNumber(flight.number);
    if (!number) return [];
    const leg = chosenLeg(flight);
    if (!leg) return [{ tripId: trip.id, date: onTrip(flight.date), ...flightNumberItem(number) }];
    const date = onTrip(leg.departure.date ?? flight.date);
    return [{ tripId: trip.id, date, ...flightItem(leg, trip) }];
  });
}
