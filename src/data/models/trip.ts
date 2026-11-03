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

/** A photo the user picked for a trip's cover, made smaller on the device. */
export interface CoverPhoto {
  /** JPEG `data:` URL, at most 1600px on the long side: the large covers. */
  image: string;
  /** Square JPEG `data:` URL of the middle of the photo: the small covers in lists. */
  thumbnail: string;
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
  /** Null: the cover is the city's gradient. */
  cover: CoverPhoto | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
