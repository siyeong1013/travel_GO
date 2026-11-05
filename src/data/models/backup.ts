import type { ISODateTime } from '@/data/models/common';
import type { VisitedCountry } from '@/data/models/country';
import type {
  Companion,
  Expense,
  ExpenseShare,
  ExpenseWithShares,
  Settlement,
} from '@/data/models/expense';
import type { ScheduleItem } from '@/data/models/schedule';
import type { Trip } from '@/data/models/trip';

/** The trips and everything in them: what syncs as records (`RecordsByKind`). */
export interface BackupData {
  trips: Trip[];
  scheduleItems: ScheduleItem[];
  companions: Companion[];
  expenses: Expense[];
  expenseShares: ExpenseShare[];
  settlements: Settlement[];
}

/**
 * The units records are synced in (and kept on the server): an expense goes with its shares,
 * as in backup merges.
 */
export interface RecordsByKind {
  trip: Trip;
  scheduleItem: ScheduleItem;
  companion: Companion;
  expense: ExpenseWithShares;
  settlement: Settlement;
}

export type RecordKind = keyof RecordsByKind;

/** Everything the app stores: the trips, and the countries the person has been to. */
export interface BackupContents extends BackupData {
  visitedCountries: VisitedCountry[];
}

export interface BackupFile extends BackupContents {
  app: 'travel-go';
  schemaVersion: number;
  exportedAt: ISODateTime;
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
  companions: ImportCounts;
  /** Expenses together with their shares. */
  expenses: ImportCounts;
  settlements: ImportCounts;
  visitedCountries: ImportCounts;
  /** Items that ended up outside their trip's dates and were moved to the inbox. */
  movedToInbox: number;
}
