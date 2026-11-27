import type { TravelGoDB } from '@/data/local/db';
import type { ChecklistItem, ID } from '@/data/models';
import {
  type ChecklistRepository,
  EntityNotFoundError,
  ValidationError,
} from '@/data/repositories';
import {
  cleanChecklistText,
  compareChecklistItems,
  MAX_CHECKLIST_ITEMS,
} from '@/data/rules/checklist';
import type { Clock } from '@/lib/dates';
import { newId } from '@/lib/id';

export function createLocalChecklistRepository(db: TravelGoDB, now: Clock): ChecklistRepository {
  const itemsOf = async (tripId: ID) =>
    (await db.checklistItems.where('tripId').equals(tripId).toArray()).sort(compareChecklistItems);

  /** Adds `texts` (already clean) at the end of the trip's list. Inside a transaction. */
  async function append(tripId: ID, texts: string[]): Promise<ChecklistItem[]> {
    if (!(await db.trips.get(tripId))) throw new EntityNotFoundError('trip', tripId);
    const existing = await itemsOf(tripId);
    if (existing.length + texts.length > MAX_CHECKLIST_ITEMS) {
      throw new ValidationError(`at most ${MAX_CHECKLIST_ITEMS} items`);
    }
    const next = Math.max(-1, ...existing.map((item) => item.order)) + 1;
    const timestamp = now();
    const added = texts.map(
      (text, i): ChecklistItem => ({
        id: newId(),
        tripId,
        text,
        checked: false,
        assigneeId: null,
        order: next + i,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
    await db.checklistItems.bulkAdd(added);
    return added;
  }

  return {
    listByTrip(tripId) {
      return itemsOf(tripId);
    },

    async countByTrip() {
      const counts: Record<ID, number> = {};
      await db.checklistItems.each((item) => {
        counts[item.tripId] = (counts[item.tripId] ?? 0) + 1;
      });
      return counts;
    },

    add(tripId, texts) {
      return db.transaction('rw', db.trips, db.checklistItems, () =>
        append(tripId, texts.map(cleanChecklistText)),
      );
    },

    copyFrom(fromTripId, toTripId) {
      return db.transaction('rw', db.trips, db.checklistItems, async () => {
        const texts = (await itemsOf(fromTripId)).map((item) => item.text);
        return append(toTripId, texts);
      });
    },

    update(id, patch) {
      return db.transaction('rw', db.checklistItems, db.companions, async () => {
        const item = await db.checklistItems.get(id);
        if (!item) throw new EntityNotFoundError('checklistItem', id);
        const next: ChecklistItem = { ...item };
        if (patch.text !== undefined) next.text = cleanChecklistText(patch.text);
        if (patch.checked !== undefined) next.checked = patch.checked;
        if (patch.assigneeId !== undefined) {
          if (patch.assigneeId !== null) {
            const companion = await db.companions.get(patch.assigneeId);
            if (!companion || companion.tripId !== item.tripId) {
              throw new ValidationError('the assignee must be a companion of this trip');
            }
          }
          next.assigneeId = patch.assigneeId;
        }
        const changed =
          next.text !== item.text ||
          next.checked !== item.checked ||
          next.assigneeId !== item.assigneeId;
        if (!changed) return item;
        next.updatedAt = now();
        await db.checklistItems.put(next);
        return next;
      });
    },

    async delete(id) {
      await db.checklistItems.delete(id);
    },

    restore(item) {
      return db.transaction('rw', db.trips, db.companions, db.checklistItems, async () => {
        if (!(await db.trips.get(item.tripId))) return;
        const assignee = item.assigneeId ? await db.companions.get(item.assigneeId) : null;
        // A new edit, so the item comes back on the other devices too.
        await db.checklistItems.put({
          ...item,
          assigneeId: assignee ? item.assigneeId : null,
          updatedAt: now(),
        });
      });
    },
  };
}
