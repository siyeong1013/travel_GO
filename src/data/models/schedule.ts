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

export interface ScheduleItem {
  id: ID;
  tripId: ID;
  /** Day of the trip, or null for the inbox (보관함, not yet scheduled). */
  date: LocalDate | null;
  /** Position within its group (same trip + same date/inbox), 0-based and contiguous. */
  order: number;
  place: PlaceSnapshot;
  time: LocalTime | null;
  /** Empty string when there is no memo. */
  memo: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
