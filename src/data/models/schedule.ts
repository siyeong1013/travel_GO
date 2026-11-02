import type { GeoPoint, ID, ISODateTime, LocalDate, LocalTime } from '@/data/models/common';

/** Copy of the place data at the time it was added, so it can be shown offline. */
export interface PlaceSnapshot {
  /** Google Place ID; null for places entered by hand. */
  placeId: string | null;
  name: string;
  address: string | null;
  /** Null when unknown (hand-entered). Such items are not drawn on the map. */
  location: GeoPoint | null;
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
