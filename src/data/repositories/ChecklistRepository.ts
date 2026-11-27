import type { ChecklistItem, ID } from '@/data/models';

export interface ChecklistItemPatch {
  text?: string;
  checked?: boolean;
  assigneeId?: ID | null;
}

export interface ChecklistRepository {
  /** The trip's items in list order (`compareChecklistItems`). */
  listByTrip(tripId: ID): Promise<ChecklistItem[]>;
  /** How many items each trip has (trips without any are left out). */
  countByTrip(): Promise<Record<ID, number>>;
  /**
   * Adds items with these texts at the end, unchecked and nobody's, in one go. Texts are trimmed;
   * an empty or too long one, or going over `MAX_CHECKLIST_ITEMS`, throws `ValidationError`.
   */
  add(tripId: ID, texts: string[]): Promise<ChecklistItem[]>;
  /** Adds the texts of `fromTripId`'s items to `toTripId` (unchecked and nobody's). */
  copyFrom(fromTripId: ID, toTripId: ID): Promise<ChecklistItem[]>;
  /** `assigneeId` must be a companion of the trip. */
  update(id: ID, patch: ChecklistItemPatch): Promise<ChecklistItem>;
  /** No-op if it doesn't exist. */
  delete(id: ID): Promise<void>;
  /** Puts a deleted item back as it was ("되돌리기"), unless its trip is gone. */
  restore(item: ChecklistItem): Promise<void>;
}
