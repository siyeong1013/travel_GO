import { describe, expect, it } from 'vitest';
import { BackupFormatError } from '@/data/repositories';
import {
  BACKUP_SCHEMA_VERSION,
  createBackupFile,
  parseBackupFile,
} from '@/data/rules/backupFormat';
import { makeItem, makePlace, makeTrip } from '@/test/fixtures';

function sampleFile() {
  const trip = makeTrip({ city: { name: '오사카', placeId: 'osaka', location: { lat: 34.7, lng: 135.5 } } });
  return createBackupFile(
    [trip],
    [
      makeItem({ tripId: trip.id, place: makePlace('오사카성'), time: '09:30', memo: '입장권' }),
      makeItem({ tripId: trip.id, date: null, place: makePlace('직접 입력', { placeId: null, location: null }) }),
    ],
    '2026-11-02T00:00:00.000Z',
  );
}

/** What the import UI does: file text -> JSON.parse -> parseBackupFile. */
const roundTrip = (value: unknown) => parseBackupFile(JSON.parse(JSON.stringify(value)));

function expectInvalid(raw: unknown, code: string, message?: string) {
  try {
    parseBackupFile(raw);
  } catch (error) {
    expect(error).toBeInstanceOf(BackupFormatError);
    expect((error as BackupFormatError).code).toBe(code);
    if (message) expect((error as Error).message).toContain(message);
    return;
  }
  throw new Error('expected parseBackupFile to throw');
}

describe('backup file format', () => {
  it('survives a JSON round trip unchanged', () => {
    const file = sampleFile();
    expect(file.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(roundTrip(file)).toEqual(file);
  });

  it('drops unknown fields', () => {
    const file = sampleFile();
    const parsed = roundTrip({ ...file, extra: 1, trips: [{ ...file.trips[0], extra: 1 }] });
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed.trips[0]).not.toHaveProperty('extra');
  });

  it('rejects files from other apps and newer schema versions', () => {
    expectInvalid('not json object', 'backup_invalid');
    expectInvalid({ ...sampleFile(), app: 'other' }, 'backup_invalid');
    expectInvalid(
      { ...sampleFile(), schemaVersion: BACKUP_SCHEMA_VERSION + 1 },
      'backup_unsupported_version',
    );
  });

  it('points at the first invalid field', () => {
    const file = sampleFile();
    const badDate = { ...file, trips: [{ ...file.trips[0], startDate: '2026-02-30' }] };
    expectInvalid(badDate, 'backup_invalid', '$.trips[0].startDate');

    const reversed = { ...file, trips: [{ ...file.trips[0], endDate: '2026-11-01' }] };
    expectInvalid(reversed, 'backup_invalid', '$.trips[0].endDate');

    const badTime = { ...file, scheduleItems: [{ ...file.scheduleItems[0], time: '25:00' }] };
    expectInvalid(badTime, 'backup_invalid', '$.scheduleItems[0].time');
  });

  it('rejects dangling trip references and duplicate ids', () => {
    const file = sampleFile();
    const dangling = { ...file, scheduleItems: [{ ...file.scheduleItems[0], tripId: 'nope' }] };
    expectInvalid(dangling, 'backup_invalid', '$.scheduleItems[0].tripId');

    const duplicate = { ...file, trips: [file.trips[0], file.trips[0]] };
    expectInvalid(duplicate, 'backup_invalid', '$.trips[1].id');
  });
});
