import type { BackupFile, ImportMode, ImportSummary } from '@/data/models';

/** Validate untrusted files with `parseBackupFile` (data/rules/backupFormat) before passing them in. */
export interface BackupRepository {
  exportAll(): Promise<BackupFile>;
  /** Dry run of `importAll`: same summary, nothing written. */
  previewImport(file: BackupFile, mode: ImportMode): Promise<ImportSummary>;
  /** Runs in a single transaction. */
  importAll(file: BackupFile, mode: ImportMode): Promise<ImportSummary>;
}
