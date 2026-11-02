import type { CurrencyCode, GeoPoint, ID, ISODateTime, LocalDate } from '@/data/models/common';

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
  /** Balances and settlements are computed in it. Locked once the trip has expenses. */
  settlementCurrency: CurrencyCode;
  /** Whole-trip budget, in the settlement currency's minor unit. */
  budget: number | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
