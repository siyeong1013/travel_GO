import { describe, expect, it } from 'vitest';
import type { BackupFile, Settlement, Trip } from '@/data/models';
import { BackupFormatError } from '@/data/repositories';
import {
  BACKUP_SCHEMA_VERSION,
  createBackupFile,
  parseBackupFile,
  parseRecord,
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

/** A trip as files before v7 have it: one city, no countries. */
function beforeV7({ cities, countries, ...trip }: Trip) {
  return { ...trip, city: cities[0]! };
}

/** A file's expenses as before v9: one payer each. */
function beforeV9<T extends Pick<BackupFile, 'expenses'>>(file: T) {
  return {
    ...file,
    expenses: file.expenses.map(({ payerIds, ...expense }) => ({ ...expense, payerId: payerIds[0]! })),
  };
}

function sampleFile(): BackupFile {
  const trip = makeTrip({
    cities: [{ name: '오사카', placeId: 'osaka', location: { lat: 34.7, lng: 135.5 }, fetchedAt: T0 }],
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
      payerIds: [me.id],
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
      visitedCountries: [
        { id: 'TW', visited: true, updatedAt: '2026-11-01T00:00:00.000Z' },
        { id: 'JP', visited: false, updatedAt: '2026-11-01T00:00:00.000Z' },
      ],
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

    const strangerPays = { ...file, expenses: [{ ...file.expenses[0], payerIds: ['nope'] }] };
    expectInvalid(strangerPays, 'backup_invalid', '$.expenses[0].payerIds[0]');

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
    const { settlementCurrency, budget, ...v1Trip } = beforeV7(trip);
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
      ...beforeV9(file),
      schemaVersion: 2,
      trips: [{ ...beforeV7(trip!), city: withoutFetchedAt(trip!.cities[0]!) }],
      scheduleItems: file.scheduleItems.map((item) => ({ ...item, place: withoutFetchedAt(item.place) })),
    };

    const parsed = roundTrip(v2);

    expect(parsed.trips[0]!.cities[0]!.fetchedAt).toBe(trip!.createdAt);
    expect(parsed.scheduleItems.find((i) => i.id === google!.id)!.place.fetchedAt).toBe(
      google!.createdAt,
    );
    expect(parsed.scheduleItems.find((i) => i.id === typed!.id)!.place.fetchedAt).toBeNull();
  });

  it('converts v3 files: trips have no cover photo', () => {
    const file = sampleFile();
    const { cover, ...v3Trip } = beforeV7(file.trips[0]!);
    const parsed = roundTrip({ ...beforeV9(file), schemaVersion: 3, trips: [v3Trip] });
    expect(parsed.trips[0]).toEqual({ ...file.trips[0]!, cover: null });
  });

  it('converts v4 files: companions are names only', () => {
    const file = sampleFile();
    const v4Companions = file.companions.map(({ accountId, ...companion }) => companion);
    const trips = file.trips.map(beforeV7);
    const parsed = roundTrip({ ...beforeV9(file), schemaVersion: 4, trips, companions: v4Companions });
    expect(parsed.companions).toEqual(v4Companions.map((c) => ({ ...c, accountId: null })));
  });

  it('converts v5 files: no countries yet', () => {
    const { visitedCountries, ...v5 } = beforeV9(sampleFile());
    expect(visitedCountries.map((c) => c.id)).toEqual(['JP', 'TW']);
    const trips = v5.trips.map(beforeV7);
    expect(roundTrip({ ...v5, schemaVersion: 5, trips }).visitedCountries).toEqual([]);
  });

  it('converts v6 files: a trip has its city as its cities and no countries', () => {
    const file = sampleFile();
    const parsed = roundTrip({ ...beforeV9(file), schemaVersion: 6, trips: file.trips.map(beforeV7) });
    expect(parsed.trips).toEqual(file.trips.map((trip) => ({ ...trip, countries: [] })));
    // Regions came with v7.
    const regions = [{ id: 'JP-27', visited: true, updatedAt: file.exportedAt }];
    expectInvalid(
      {
        ...beforeV9(file),
        schemaVersion: 6,
        trips: file.trips.map(beforeV7),
        visitedCountries: regions,
      },
      'backup_invalid',
      '$.visitedCountries[0].id',
    );
    expect(roundTrip({ ...file, visitedCountries: regions }).visitedCountries).toEqual(regions);
  });

  it('takes cities among visited places, in v7 files too', () => {
    const file = sampleFile();
    const cities = [{ id: 'JP-01:삿포로', visited: true, updatedAt: file.exportedAt }];
    expect(roundTrip({ ...file, visitedCountries: cities }).visitedCountries).toEqual(cities);
    expect(roundTrip({ ...beforeV9(file), schemaVersion: 7, visitedCountries: cities }).visitedCountries).toEqual(cities);
    const broken = [{ id: 'JP-01:', visited: true, updatedAt: file.exportedAt }];
    expectInvalid({ ...file, visitedCountries: broken }, 'backup_invalid', '$.visitedCountries[0].id');
  });

  it('converts v8 files: an expense has its one payer as its payers', () => {
    const file = sampleFile();
    const parsed = roundTrip({ ...beforeV9(file), schemaVersion: 8 });
    expect(parsed.expenses).toEqual(file.expenses);
    expect(parsed.expenses[0]!.payerIds).toHaveLength(1);
  });

  it('takes several payers, each once, and one at least', () => {
    const file = sampleFile();
    const [me, friend] = file.companions;
    const payers = (payerIds: unknown) => ({
      ...file,
      expenses: [{ ...file.expenses[0], payerIds }],
    });
    expect(roundTrip(payers([me!.id, friend!.id])).expenses[0]!.payerIds).toEqual([me!.id, friend!.id]);
    expectInvalid(payers([]), 'backup_invalid', '$.expenses[0].payerIds');
    expectInvalid(payers([me!.id, me!.id]), 'backup_invalid', '$.expenses[0].payerIds');
    expectInvalid(payers(me!.id), 'backup_invalid', '$.expenses[0].payerIds');
    // A v8 file has one, as `payerId`.
    expectInvalid({ ...payers([me!.id]), schemaVersion: 8 }, 'backup_invalid', '$.expenses[0].payerId');
  });

  it('reads a server expense of the format before v9 (one payer) into the current shape', () => {
    const file = sampleFile();
    const [old] = beforeV9(file).expenses;
    const shares = file.expenseShares.filter((share) => share.expenseId === old!.id);
    const raw = JSON.parse(JSON.stringify({ ...old, shares }));
    expect(parseRecord('expense', raw, 7)).toEqual({ ...file.expenses[0], shares });
    expect(() => parseRecord('expense', raw, 9)).toThrow(BackupFormatError);
  });

  it("takes a trip's countries by code, each once, and one city at least", () => {
    const file = sampleFile();
    const withTrip = (trip: Record<string, unknown>) => ({ ...file, trips: [{ ...file.trips[0], ...trip }] });
    expect(roundTrip(withTrip({ countries: ['JP', 'KR'] })).trips[0]!.countries).toEqual(['JP', 'KR']);
    expectInvalid(withTrip({ countries: ['japan'] }), 'backup_invalid', '$.trips[0].countries[0]');
    expectInvalid(withTrip({ countries: ['JP', 'JP'] }), 'backup_invalid', '$.trips[0].countries');
    expectInvalid(withTrip({ cities: [] }), 'backup_invalid', '$.trips[0].cities');
    const blank = { name: ' ', placeId: null, location: null, fetchedAt: null };
    expectInvalid(withTrip({ cities: [blank] }), 'backup_invalid', '$.trips[0].cities[0].name');
  });

  it('takes countries by their codes only', () => {
    const file = sampleFile();
    const visitedCountries = [{ id: 'japan', visited: true, updatedAt: file.exportedAt }];
    expectInvalid({ ...file, visitedCountries }, 'backup_invalid', '$.visitedCountries[0].id');
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
