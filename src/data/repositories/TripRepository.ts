import type { ID, PlaceData, Trip } from '@/data/models';

/**
 * New trips start with settlement currency KRW, no budget, and a "나" companion; and without
 * countries or a cover photo unless they are given.
 */
export type NewTrip = Pick<Trip, 'title' | 'cities' | 'startDate' | 'endDate'> &
  Partial<Pick<Trip, 'countries' | 'cover'>>;
/** `cover: null` removes the photo. */
export type TripPatch = Partial<NewTrip & Pick<Trip, 'settlementCurrency' | 'budget'>>;

export interface TripCreateOptions {
  /**
   * The new trip's id (a UUID), made up front by the caller; otherwise a new one. The trip form
   * makes it when it opens, since the id picks the cover's color it shows.
   */
  id?: ID;
}

export interface TripUpdateOptions {
  /**
   * What to do with dated items that fall outside the new dates.
   * Without it, `update` throws `OutOfRangeItemsError` (with the count) and changes nothing.
   */
  outOfRangeItems?: 'moveToInbox' | 'delete';
}

export interface TripRepository {
  /**
   * Sorted by `startDate`, then `createdAt`. Like `get`, removes a city's Google coordinates once
   * they are 30 days old (`data/rules/placeData`).
   */
  list(): Promise<Trip[]>;
  get(id: ID): Promise<Trip | undefined>;
  /** Throws `ValidationError` for an id that isn't a UUID, and fails for one already in use. */
  create(input: NewTrip, options?: TripCreateOptions): Promise<Trip>;
  /**
   * Throws `OutOfRangeItemsError` (see options) and `CurrencyLockedError` when changing the
   * settlement currency of a trip that has expenses or settlements. A new settlement currency
   * clears the budget (it was in the old currency's units) unless the patch sets one.
   */
  update(id: ID, patch: TripPatch, options?: TripUpdateOptions): Promise<Trip>;
  /** Also deletes everything that belongs to the trip. No-op if the trip does not exist. */
  delete(id: ID): Promise<void>;
  /**
   * Freshly fetched coordinates of the trip's cities that still are that place; `updatedAt` stays
   * (not an edit). Returns the trip as stored, undefined if it does not exist.
   */
  refreshCity(id: ID, city: PlaceData): Promise<Trip | undefined>;
  /** Removes cities' Google coordinates older than 30 days (on app start). */
  expirePlaceData(): Promise<void>;
}
