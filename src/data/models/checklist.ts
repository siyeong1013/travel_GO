import type { ID, ISODateTime } from '@/data/models/common';

/**
 * A thing to pack for a trip ("준비물"). One list per trip, shared by everyone on it: whoever
 * checks it, it is checked for all.
 */
export interface ChecklistItem {
  id: ID;
  tripId: ID;
  /** `여권`; 1–100 characters. */
  text: string;
  checked: boolean;
  /** The companion who brings it (a hair dryer one person packs); null: nobody in particular. */
  assigneeId: ID | null;
  /** Place in the list: the next number when added (gaps are fine), `createdAt` breaks ties. */
  order: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
