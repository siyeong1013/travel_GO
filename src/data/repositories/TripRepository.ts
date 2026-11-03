import type { ID, Trip } from '@/data/models';

/** New trips start with settlement currency KRW, no budget, and a "나" companion. */
export type NewTrip = Pick<Trip, 'title' | 'city' | 'startDate' | 'endDate'>;
export type TripPatch = Partial<NewTrip & Pick<Trip, 'settlementCurrency' | 'budget'>>;

export interface TripUpdateOptions {
  /**
   * What to do with dated items that fall outside the new dates.
   * Without it, `update` throws `OutOfRangeItemsError` (with the count) and changes nothing.
   */
  outOfRangeItems?: 'moveToInbox' | 'delete';
}

export interface TripRepository {
  /** Sorted by `startDate`, then `createdAt`. */
  list(): Promise<Trip[]>;
  get(id: ID): Promise<Trip | undefined>;
  create(input: NewTrip): Promise<Trip>;
  /**
   * Throws `OutOfRangeItemsError` (see options) and `CurrencyLockedError` when changing the
   * settlement currency of a trip that has expenses or settlements. A new settlement currency
   * clears the budget (it was in the old currency's units) unless the patch sets one.
   */
  update(id: ID, patch: TripPatch, options?: TripUpdateOptions): Promise<Trip>;
  /** Also deletes everything that belongs to the trip. No-op if the trip does not exist. */
  delete(id: ID): Promise<void>;
}
