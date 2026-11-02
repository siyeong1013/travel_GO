import type { ID, Trip } from '@/data/models';

export type NewTrip = Pick<Trip, 'title' | 'city' | 'startDate' | 'endDate'>;
export type TripPatch = Partial<NewTrip>;

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
  update(id: ID, patch: TripPatch, options?: TripUpdateOptions): Promise<Trip>;
  /** Also deletes the trip's schedule items. No-op if the trip does not exist. */
  delete(id: ID): Promise<void>;
}
