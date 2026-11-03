import type { ID, LocalDate, LocalTime, PlaceData, PlaceSnapshot, ScheduleItem } from '@/data/models';

export interface NewScheduleItem {
  tripId: ID;
  /** null adds to the inbox. */
  date: LocalDate | null;
  place: PlaceSnapshot;
  time?: LocalTime | null;
  memo?: string;
}

export type ScheduleItemPatch = Partial<Pick<ScheduleItem, 'place' | 'time' | 'memo'>>;

export interface ScheduleMoveTarget {
  /** Destination day, or null for the inbox. */
  date: LocalDate | null;
  /** Final position in the destination group; clamped to its length. */
  index: number;
}

export interface ScheduleRepository {
  /**
   * Sorted by date (inbox last), then `order`. Google's place data older than 30 days is removed
   * first (`data/rules/placeData`); creating and updating drop it too.
   */
  listByTrip(tripId: ID): Promise<ScheduleItem[]>;
  /** Appends to the end of its day (or the inbox). */
  create(input: NewScheduleItem): Promise<ScheduleItem>;
  update(id: ID, patch: ScheduleItemPatch): Promise<ScheduleItem>;
  /** Closes the gap in the remaining order. No-op if the item does not exist. */
  delete(id: ID): Promise<void>;
  /** Reorders within a group or moves between days/inbox; renumbers both groups. */
  move(id: ID, to: ScheduleMoveTarget): Promise<void>;
  /**
   * Writes freshly fetched Google data into the trip's items with these places. Names and
   * `updatedAt` stay: it is not an edit, so it must not win backup merges.
   */
  refreshPlaces(tripId: ID, places: PlaceData[]): Promise<void>;
  /** Removes Google's place data older than 30 days from every item (on app start). */
  expirePlaceData(): Promise<void>;
}
