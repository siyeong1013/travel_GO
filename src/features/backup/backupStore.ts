import { createStore, useStore } from 'zustand';
import { repositories } from '@/data';
import type { BackupFile, ImportMode, ImportSummary, ISODateTime } from '@/data/models';
import type { Repositories } from '@/data/repositories';
import { expenseStore } from '@/features/expenses/expenseStore';
import { scheduleStore } from '@/features/schedule/scheduleStore';
import { tripStore } from '@/features/trips/tripStore';
import { isIsoDateTime } from '@/lib/dates';
import { deviceStorage } from '@/lib/deviceStorage';

const LAST_EXPORT_KEY = 'travel-go:last-backup';

export interface BackupState {
  /** When a backup last left this device (saved or shared); kept on the device. Null: never. */
  lastExportedAt: ISODateTime | null;
  /** Everything, as the content of a backup file. */
  exportAll: () => Promise<BackupFile>;
  /** Remembers that the backup made at `exportedAt` was saved or shared. */
  markExported: (exportedAt: ISODateTime) => void;
  /** What importing `file` would do. Writes nothing. */
  preview: (file: BackupFile, mode: ImportMode) => Promise<ImportSummary>;
  /** Imports `file` (one transaction), then has the stores holding data read it again. */
  importFile: (file: BackupFile, mode: ImportMode) => Promise<ImportSummary>;
}

interface BackupStoreOptions {
  /** After an import: what other stores hold is out of date. */
  afterImport?: () => void;
  storage?: () => Storage | undefined;
}

export function createBackupStore(
  repos: Pick<Repositories, 'backup'>,
  { afterImport = () => {}, storage = deviceStorage }: BackupStoreOptions = {},
) {
  return createStore<BackupState>()((set) => ({
    lastExportedAt: readLastExport(storage),

    exportAll: () => repos.backup.exportAll(),

    markExported(exportedAt) {
      set({ lastExportedAt: exportedAt });
      try {
        storage()?.setItem(LAST_EXPORT_KEY, exportedAt);
      } catch {
        // Storage full or blocked: only this visit remembers.
      }
    },

    preview: (file, mode) => repos.backup.previewImport(file, mode),

    async importFile(file, mode) {
      const summary = await repos.backup.importAll(file, mode);
      afterImport();
      return summary;
    },
  }));
}

function readLastExport(storage: () => Storage | undefined): ISODateTime | null {
  try {
    const value = storage()?.getItem(LAST_EXPORT_KEY) ?? null;
    return isIsoDateTime(value) ? value : null;
  } catch {
    return null;
  }
}

/** Empties the stores holding trip data, so every screen reads it again. */
function resetDataStores() {
  tripStore.setState(tripStore.getInitialState(), true);
  scheduleStore.setState(scheduleStore.getInitialState(), true);
  expenseStore.setState(expenseStore.getInitialState(), true);
}

export const backupStore = createBackupStore(repositories, { afterImport: resetDataStores });

export function useBackupStore<T>(selector: (state: BackupState) => T): T {
  return useStore(backupStore, selector);
}
