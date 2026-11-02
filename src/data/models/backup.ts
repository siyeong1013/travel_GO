import type { ISODateTime } from '@/data/models/common';
import type { ScheduleItem } from '@/data/models/schedule';
import type { Trip } from '@/data/models/trip';

export interface BackupFile {
  app: 'travel-go';
  schemaVersion: number;
  exportedAt: ISODateTime;
  trips: Trip[];
  scheduleItems: ScheduleItem[];
}

/** `merge`: keep the newer record per id. `overwrite`: replace all local data with the file. */
export type ImportMode = 'merge' | 'overwrite';

export interface ImportCounts {
  /** Records in the file that did not exist locally (overwrite: every record in the file). */
  added: number;
  /** Local records replaced by a newer record from the file. */
  updated: number;
  /** Records in the file ignored because the local one is the same age or newer. */
  kept: number;
  /** Local records deleted (overwrite only). */
  removed: number;
}

export interface ImportSummary {
  mode: ImportMode;
  trips: ImportCounts;
  scheduleItems: ImportCounts;
  /** Items that ended up outside their trip's dates and were moved to the inbox. */
  movedToInbox: number;
}
