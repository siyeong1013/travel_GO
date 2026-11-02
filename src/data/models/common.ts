/** UUID string, generated on the client (compatible with PostgreSQL `uuid`). */
export type ID = string;

/** Calendar date at the destination, `YYYY-MM-DD`. No time zone. */
export type LocalDate = string;

/** Wall-clock time, `HH:mm`. */
export type LocalTime = string;

/** ISO 8601 timestamp, e.g. `2026-11-02T09:00:00.000Z`. */
export type ISODateTime = string;

export interface GeoPoint {
  lat: number;
  lng: number;
}
