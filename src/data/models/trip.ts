import type { CurrencyCode, GeoPoint, ID, ISODateTime, LocalDate } from '@/data/models/common';

export interface TripCity {
  name: string;
  /** Google Place ID of the city; used to bias place search. */
  placeId: string | null;
  /** Google's coordinates of the city: kept for 30 days at most, like a place's (`PlaceSnapshot`). */
  location: GeoPoint | null;
  /** When `location` was fetched from Google; null when there is none. */
  fetchedAt: ISODateTime | null;
}

export interface Trip {
  id: ID;
  title: string;
  city: TripCity;
  startDate: LocalDate;
  /** Inclusive. */
  endDate: LocalDate;
  /** Balances and settlements are computed in it. Locked once the trip has expenses. */
  settlementCurrency: CurrencyCode;
  /** Whole-trip budget, in the settlement currency's minor unit. */
  budget: number | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
