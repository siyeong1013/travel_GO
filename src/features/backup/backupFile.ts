import type {
  BackupContents,
  BackupFile,
  ImportCounts,
  ImportSummary,
  ISODateTime,
} from '@/data/models';
import { BackupFormatError } from '@/data/repositories';
import { parseBackupFile } from '@/data/rules/backupFormat';

/** `travel-go-backup-2026-11-03-1420.json`, in the device's time zone (names sort by time). */
export function backupFileName(exportedAt: ISODateTime): string {
  const at = new Date(exportedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  return `travel-go-backup-${date}-${pad(at.getHours())}${pad(at.getMinutes())}.json`;
}

/** The backup as a JSON file to save or share. */
export function toFile(backup: BackupFile): File {
  return new File([JSON.stringify(backup, null, 2)], backupFileName(backup.exportedAt), {
    type: 'application/json',
  });
}

/** A file the user picked, checked with `parseBackupFile`. Throws `BackupFormatError`. */
export async function readBackupFile(file: Blob): Promise<BackupFile> {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new BackupFormatError('backup_invalid', 'not a JSON file');
  }
  return parseBackupFile(raw);
}

/** Where a file failed the check, e.g. `$.trips[0].startDate`, when the error says. */
export function invalidAt(error: unknown): string | null {
  if (!(error instanceof BackupFormatError)) return null;
  return /^(\$[^\s:]*):/.exec(error.message)?.[1] ?? null;
}

type Kind =
  | 'trips'
  | 'scheduleItems'
  | 'expenses'
  | 'companions'
  | 'settlements'
  | 'visitedCountries';

const KINDS: readonly [Kind, string][] = [
  ['trips', '여행'],
  ['scheduleItems', '일정'],
  ['expenses', '지출'],
  ['companions', '동행자'],
  ['settlements', '송금 기록'],
  ['visitedCountries', '다녀온 나라'],
];

/** `여행 2개 · 일정 18개`, leaving out kinds with none ('' when there is nothing). */
function countsText(count: (kind: Kind) => number): string {
  return KINDS.filter(([kind]) => count(kind) > 0)
    .map(([kind, label]) => `${label} ${count(kind)}개`)
    .join(' · ');
}

/** What a backup holds: `여행 3개 · 일정 24개 · 지출 15개 · 동행자 6개`. */
export function contentsText(data: BackupContents): string {
  return countsText((kind) => data[kind].length) || '비어 있는 백업이에요.';
}

export interface PreviewLine {
  /** `새로 추가`, `갱신`, `유지`; `지워짐`, `가져옴`. */
  label: string;
  total: number;
  /** Counts by kind, e.g. `여행 1개 · 일정 3개`. */
  detail: string;
}

/** What an import does. Merge: added, updated, kept. Overwrite: removed, then added. */
export function previewLines(summary: ImportSummary): PreviewLine[] {
  const line = (label: string, field: keyof ImportCounts): PreviewLine => {
    const count = (kind: Kind) => summary[kind][field];
    const total = KINDS.reduce((sum, [kind]) => sum + count(kind), 0);
    return { label, total, detail: countsText(count) };
  };
  return summary.mode === 'merge'
    ? [line('새로 추가', 'added'), line('갱신', 'updated'), line('유지', 'kept')]
    : [line('지워짐', 'removed'), line('가져옴', 'added')];
}

/** The notice once an import is done. */
export function importedMessage(summary: ImportSummary): string {
  if (summary.mode === 'overwrite') return '백업 파일의 내용으로 바꿨어요.';
  const [added, updated] = previewLines(summary);
  return added!.total + updated!.total === 0
    ? '가져왔어요. 바뀐 내용은 없어요.'
    : `가져왔어요. 새로 추가 ${added!.total}개, 갱신 ${updated!.total}개.`;
}
