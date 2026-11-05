import { describe, expect, it } from 'vitest';
import type { BackupFile, Settlement } from '@/data/models';
import { BackupFormatError } from '@/data/repositories';
import {
  BACKUP_SCHEMA_VERSION,
  createBackupFile,
  parseBackupFile,
} from '@/data/rules/backupFormat';
import { makeMeCompanion, meCompanionId } from '@/data/rules/companion';
import { newId } from '@/lib/id';
import {
  backupData,
  makeCompanion,
  makeCover,
  makeExpense,
  makeItem,
  makePlace,
  makeTrip,
  T0,
} from '@/test/fixtures';

function sampleFile(): BackupFile {
  const trip = makeTrip({
    city: { name: '오사카', placeId: 'osaka', location: { lat: 34.7, lng: 135.5 }, fetchedAt: T0 },
    budget: 500_000,
    cover: makeCover('osaka'),
  });
  const me = makeMeCompanion(trip.id, T0);
  const friend = makeCompanion({
    tripId: trip.id,
    name: '철수',
    accountId: 'bbbbbbbb-0000-4000-8000-000000000002',
  });
  const item = makeItem({ tripId: trip.id, place: makePlace('오사카성'), time: '09:30', memo: '입장권' });
  const { shares, ...expense } = makeExpense(
    {
      tripId: trip.id,
      payerId: me.id,
      amount: 1234,
      currency: 'JPY',
      exchangeRate: { rate: '9.0412', quote: 'KRW', source: 'api', fetchedAt: T0 },
      scheduleItemId: item.id,
    },
    [
      { companionId: me.id, weight: 1, amount: 617 },
      { companionId: friend.id, weight: 1, amount: 617 },
    ],
  );
  const settlement: Settlement = {
    id: newId(),
    tripId: trip.id,
    fromId: friend.id,
    toId: me.id,
    amount: 5000,
    currency: 'KRW',
    createdAt: T0,
    updatedAt: T0,
  };
  return createBackupFile(
    backupData({
      trips: [trip],
      scheduleItems: [
        item,
        makeItem({ tripId: trip.id, date: null, place: makePlace('직접 입력', { placeId: null, location: null, fetchedAt: null }) }),
      ],
      companions: [me, friend],
      expenses: [expense],
      expenseShares: shares,
      settlements: [settlement],
    }),
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

    const fractional = { ...file, expenses: [{ ...file.expenses[0], amount: 12.5 }] };
    expectInvalid(fractional, 'backup_invalid', '$.expenses[0].amount');

    const unknownCurrency = { ...file, expenses: [{ ...file.expenses[0], currency: 'XYZ' }] };
    expectInvalid(unknownCurrency, 'backup_invalid', '$.expenses[0].currency');
  });

  it('rejects dangling references and duplicate ids', () => {
    const file = sampleFile();
    const dangling = { ...file, scheduleItems: [{ ...file.scheduleItems[0], tripId: 'nope' }] };
    expectInvalid(dangling, 'backup_invalid', '$.scheduleItems[0].tripId');

    const duplicate = { ...file, trips: [file.trips[0], file.trips[0]] };
    expectInvalid(duplicate, 'backup_invalid', '$.trips[1].id');

    const strangerPays = { ...file, expenses: [{ ...file.expenses[0], payerId: 'nope' }] };
    expectInvalid(strangerPays, 'backup_invalid', '$.expenses[0].payerId');

    const toSelf = {
      ...file,
      settlements: [{ ...file.settlements[0], toId: file.settlements[0]!.fromId }],
    };
    expectInvalid(toSelf, 'backup_invalid', '$.settlements[0].toId');
  });

  it("requires every expense's shares to add up and every trip to have one 나", () => {
    const file = sampleFile();
    const short = { ...file, expenseShares: [{ ...file.expenseShares[0], amount: 1 }, file.expenseShares[1]] };
    expectInvalid(short, 'backup_invalid', '$.expenses[0].amount');

    const noMe = { ...file, companions: file.companions.filter((c) => !c.isMe) };
    expectInvalid(noMe, 'backup_invalid', '"나"');
  });

  it('converts v1 files: trip defaults and the same "나" every time', () => {
    const trip = makeTrip();
    const { settlementCurrency, budget, ...v1Trip } = trip;
    const v1 = {
      app: 'travel-go',
      schemaVersion: 1,
      exportedAt: T0,
      trips: [v1Trip],
      scheduleItems: [makeItem({ tripId: trip.id })],
    };

    const parsed = roundTrip(v1);

    expect(parsed.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(parsed.trips[0]).toMatchObject({ settlementCurrency: 'KRW', budget: null });
    expect(parsed.companions).toEqual([makeMeCompanion(trip.id, trip.createdAt)]);
    expect(parsed.companions[0]!.id).toBe(meCompanionId(trip.id));
    expect(parsed.expenses).toEqual([]);
    expect(roundTrip(v1)).toEqual(parsed);
  });

  it("converts v2 files: Google data counts as fetched when its record was created", () => {
    const file = sampleFile();
    const [trip] = file.trips;
    const [google, typed] = file.scheduleItems;
    const withoutFetchedAt = <T extends { fetchedAt: unknown }>({ fetchedAt, ...rest }: T) => rest;
    const v2 = {
      ...file,
      schemaVersion: 2,
      trips: [{ ...trip, city: withoutFetchedAt(trip!.city) }],
      scheduleItems: file.scheduleItems.map((item) => ({ ...item, place: withoutFetchedAt(item.place) })),
    };

    const parsed = roundTrip(v2);

    expect(parsed.trips[0]!.city.fetchedAt).toBe(trip!.createdAt);
    expect(parsed.scheduleItems.find((i) => i.id === google!.id)!.place.fetchedAt).toBe(
      google!.createdAt,
    );
    expect(parsed.scheduleItems.find((i) => i.id === typed!.id)!.place.fetchedAt).toBeNull();
  });

  it('converts v3 files: trips have no cover photo', () => {
    const file = sampleFile();
    const { cover, ...v3Trip } = file.trips[0]!;
    const parsed = roundTrip({ ...file, schemaVersion: 3, trips: [v3Trip] });
    expect(parsed.trips[0]).toEqual({ ...v3Trip, cover: null });
  });

  it('converts v4 files: companions are names only', () => {
    const file = sampleFile();
    const v4Companions = file.companions.map(({ accountId, ...companion }) => companion);
    const parsed = roundTrip({ ...file, schemaVersion: 4, companions: v4Companions });
    expect(parsed.companions).toEqual(v4Companions.map((c) => ({ ...c, accountId: null })));
  });

  it('takes a cover photo only as an image held in the file', () => {
    const file = sampleFile();
    const withCover = (cover: unknown) => ({ ...file, trips: [{ ...file.trips[0], cover }] });
    expect(roundTrip(withCover(null)).trips[0]!.cover).toBeNull();
    expectInvalid(
      withCover({ ...makeCover(), image: 'https://example.com/tracker.jpg' }),
      'backup_invalid',
      '$.trips[0].cover.image',
    );
    expectInvalid(
      withCover({ image: makeCover().image }),
      'backup_invalid',
      '$.trips[0].cover.thumbnail',
    );
  });

  it('needs the fetch time of Google data in v3 files', () => {
    const file = sampleFile();
    const [google] = file.scheduleItems;
    const missing = {
      ...file,
      scheduleItems: [{ ...google, place: { ...google!.place, fetchedAt: null } }],
    };
    expectInvalid(missing, 'backup_invalid', '$.scheduleItems[0].place.fetchedAt');
  });
});
