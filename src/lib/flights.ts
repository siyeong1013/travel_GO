// Flights for the schedule: a flight number typed where a place goes, looked up for its day by the
// app's server function (api/flight.ts), which asks AeroDataBox. The function takes its types from
// here (types only: it runs on its own), so no `@/` imports.

/** One end of a flight, in the airport's local time. */
export interface FlightEnd {
  /** IATA code (`ICN`), when the airport has one. */
  iata: string | null;
  /** As the flight data names it (`Incheon`). */
  name: string;
  /** `YYYY-MM-DD`, local. */
  date: string | null;
  /** `HH:mm`, local. */
  time: string | null;
  terminal: string | null;
}

export interface FlightLeg {
  /** Without the space (`KE723`). */
  number: string;
  airline: string | null;
  departure: FlightEnd;
  arrival: FlightEnd;
}

/**
 * What the server function answers. `signedOut`: only signed-in accounts look flights up (the
 * key's monthly quota is the app's). `unavailable`: the server has no key, or it was refused.
 * `busy`: over the quota or too many at once.
 */
export type FlightAnswer =
  | { status: 'ok'; flights: FlightLeg[] }
  | { status: 'notFound' | 'invalid' | 'signedOut' | 'unavailable' | 'busy' | 'error' };

/**
 * A flight number typed as a place (`KE723`, `7c 1301`, `KAL723`), as the server takes it
 * (`KE723`); null for anything else.
 */
export function parseFlightNumber(text: string): string | null {
  const match = /^\s*([A-Z0-9]{2}|[A-Z]{3})\s?(\d{1,4}[A-Z]?)\s*$/i.exec(text);
  if (!match || !/[A-Z]/i.test(match[1]!)) return null;
  return `${match[1]}${match[2]}`.toUpperCase();
}
