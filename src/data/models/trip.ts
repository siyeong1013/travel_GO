import type { GeoPoint, ID, ISODateTime, LocalDate } from '@/data/models/common';

export interface TripCity {
  name: string;
  /** Google Place ID of the city; used to bias place search. */
  placeId: string | null;
  location: GeoPoint | null;
}

export interface Trip {
  id: ID;
  title: string;
  city: TripCity;
  startDate: LocalDate;
  /** Inclusive. */
  endDate: LocalDate;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
