import { describe, expect, it } from 'vitest';
import type { ImportCounts, ImportSummary } from '@/data/models';
import { BackupFormatError } from '@/data/repositories';
import { createBackupFile } from '@/data/rules/backupFormat';
import {
  backupFileName,
  contentsText,
  importedMessage,
  invalidAt,
  previewLines,
  readBackupFile,
  toFile,
} from '@/features/backup/backupFile';
import { backupData, emptyData, makeItem, makeTrip, T0 } from '@/test/fixtures';

const counts = (added = 0, updated = 0, kept = 0, removed = 0): ImportCounts => ({
  added,
  updated,
  kept,
  removed,
});

function summary(mode: ImportSummary['mode'], overrides: Partial<ImportSummary> = {}): ImportSummary {
  return {
    mode,
    trips: counts(),
    scheduleItems: counts(),
    companions: counts(),
    expenses: counts(),
    settlements: counts(),
    visitedCountries: counts(),
    movedToInbox: 0,
    ...overrides,
  };
}

async function readError(text: string) {
  try {
    await readBackupFile(new Blob([text]));
  } catch (error) {
    return error;
  }
  throw new Error('expected readBackupFile to fail');
}

describe('backup files', () => {
  it('are named for when they were made, in local time', () => {
    const at = new Date(2026, 10, 3, 9, 5).toISOString();
    expect(backupFileName(at)).toBe('travel-go-backup-2026-11-03-0905.json');
  });

  it('read back what was saved', async () => {
    const trip = makeTrip();
    const backup = createBackupFile(
      backupData({ trips: [trip], scheduleItems: [makeItem({ tripId: trip.id })] }),
      T0,
    );
    const file = toFile(backup);
    expect(file.type).toBe('application/json');
    expect(await readBackupFile(file)).toEqual(backup);
  });

  it('say where a file is wrong, when they can', async () => {
    const notJson = await readError('{ trips: ');
    expect(notJson).toBeInstanceOf(BackupFormatError);
    expect(invalidAt(notJson)).toBeNull();

    const backup = createBackupFile(backupData({ trips: [makeTrip()] }), T0);
    const badDate = await readError(
      JSON.stringify({ ...backup, trips: [{ ...backup.trips[0], startDate: '2026-02-30' }] }),
    );
    expect(invalidAt(badDate)).toBe('$.trips[0].startDate');

    const otherApp = await readError(JSON.stringify({ app: 'other' }));
    expect((otherApp as BackupFormatError).code).toBe('backup_invalid');
    expect(invalidAt(otherApp)).toBeNull();
    expect(invalidAt(new Error('$.x: nope'))).toBeNull();
  });

  it('describe what they hold', () => {
    const trip = makeTrip();
    const items = [makeItem({ tripId: trip.id }), makeItem({ tripId: trip.id })];
    expect(contentsText(backupData({ trips: [trip], scheduleItems: items }))).toBe(
      '여행 1개 · 일정 2개 · 동행자 1개',
    );
    expect(contentsText(emptyData())).toBe('비어 있는 백업이에요.');
  });
});

describe('import preview', () => {
  it('counts what a merge adds, updates and keeps, by kind', () => {
    const merge = summary('merge', {
      trips: counts(1, 0, 1),
      scheduleItems: counts(5, 2),
      expenses: counts(3),
      companions: counts(1, 0, 1),
    });
    expect(previewLines(merge)).toEqual([
      { label: '새로 추가', total: 10, detail: '여행 1개 · 일정 5개 · 지출 3개 · 동행자 1개' },
      { label: '갱신', total: 2, detail: '일정 2개' },
      { label: '유지', total: 2, detail: '여행 1개 · 동행자 1개' },
    ]);
    expect(importedMessage(merge)).toBe('가져왔어요. 새로 추가 10개, 갱신 2개.');
    expect(importedMessage(summary('merge', { trips: counts(0, 0, 1) }))).toBe(
      '가져왔어요. 바뀐 내용은 없어요.',
    );
  });

  it('shows what an overwrite removes, then what it brings', () => {
    const overwrite = summary('overwrite', {
      trips: counts(2, 0, 0, 1),
      scheduleItems: counts(8, 0, 0, 3),
      settlements: counts(1),
    });
    expect(previewLines(overwrite)).toEqual([
      { label: '지워짐', total: 4, detail: '여행 1개 · 일정 3개' },
      { label: '가져옴', total: 11, detail: '여행 2개 · 일정 8개 · 송금 기록 1개' },
    ]);
    expect(importedMessage(overwrite)).toBe('백업 파일의 내용으로 바꿨어요.');
  });
});
