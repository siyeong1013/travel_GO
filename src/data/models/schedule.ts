import type { GeoPoint, ID, ISODateTime, LocalDate, LocalTime } from '@/data/models/common';

/**
 * The item's place. For a Google place, the address and location are a copy kept for offline
 * use: Google's terms allow keeping coordinates for 30 days, so they are refreshed online and
 * removed when too old (`data/rules/placeData`). The name is the item's own title.
 */
export interface PlaceSnapshot {
  /** Google Place ID (may be kept indefinitely); null for places entered by hand. */
  placeId: string | null;
  name: string;
  address: string | null;
  /** Null when unknown (hand-entered, or Google's copy expired). Such items are not on the map. */
  location: GeoPoint | null;
  /** When Google's address and location were fetched; null when there are none from Google. */
  fetchedAt: ISODateTime | null;
}

/** Google's data of one place as fetched (a pick or a refresh), with when it was fetched. */
export interface PlaceData {
  placeId: string;
  address: string | null;
  location: GeoPoint | null;
  fetchedAt: ISODateTime;
}

/** One end of a flight, as its item keeps it. */
export interface FlightStop {
  /** IATA code (`ICN`); null when the flight data has none. */
  code: string | null;
  /** The airport as the app names it: `인천`, or as the flight data does (`Antalya`). */
  name: string;
  /** Local `HH:mm`; null when the flight data doesn't say. */
  time: LocalTime | null;
  /** As the flight data writes it (`2`, `T1`); null when it doesn't say. */
  terminal: string | null;
}

/**
 * The flight an item is, between the items of the airports it leaves from and lands at: what the
 * flight data (AeroDataBox) said when it was looked up. Their terms let a user's record keep it.
 */
export interface ScheduleFlight {
  /** `KE723`. */
  number: string;
  /** As the flight data names it (`Korean Air`); null when it doesn't. */
  airline: string | null;
  departure: FlightStop;
  /** And the days after it leaves that it lands: 1 the next day, -1 east over the date line. */
  arrival: FlightStop & { dayOffset: number };
}

export interface ScheduleItem {
  id: ID;
  tripId: ID;
  /** Day of the trip, or null for the inbox (보관함, not yet scheduled). */
  date: LocalDate | null;
  /** Position within its group (same trip + same date/inbox), 0-based and contiguous. */
  order: number;
  /** For a flight (`flight`), its name only: `KE723 인천 → 간사이`. */
  place: PlaceSnapshot;
  time: LocalTime | null;
  /** Empty string when there is no memo. */
  memo: string;
  /** The flight the item is, looked up; null for places (and a flight known by its number only). */
  flight: ScheduleFlight | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
