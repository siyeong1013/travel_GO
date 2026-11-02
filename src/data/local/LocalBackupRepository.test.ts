import { afterEach, describe, expect, it } from 'vitest';
import type { TravelGoDB } from '@/data/local';
import type { BackupFile } from '@/data/models';
import type { NewTrip, Repositories } from '@/data/repositories';
import { parseBackupFile } from '@/data/rules/backupFormat';
import { createTestRepositories, makePlace } from '@/test/fixtures';

const dbs: TravelGoDB[] = [];

function freshRepos(): Repositories {
  const { db, repos } = createTestRepositories();
  dbs.push(db);
  return repos;
}

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()));
});

const newTrip = (title: string): NewTrip => ({
  title,
  city: { name: '오사카', placeId: null, location: null },
  startDate: '2026-11-10',
  endDate: '2026-11-12',
});

/** What the import UI does with a file: text -> JSON.parse -> parseBackupFile. */
const viaJson = (file: BackupFile) => parseBackupFile(JSON.parse(JSON.stringify(file)));

async function dump(repos: Repositories) {
  const trips = await repos.trips.list();
  const perTrip = async <T,>(list: (tripId: string) => Promise<T[]>) =>
    (await Promise.all(trips.map((trip) => list(trip.id)))).flat();
  return {
    trips,
    items: await perTrip(repos.schedule.listByTrip),
    companions: await perTrip(repos.companions.listByTrip),
    expenses: await perTrip(repos.expenses.listByTrip),
    settlements: await perTrip(repos.settlements.listByTrip),
  };
}

async function seed(repos: Repositories, title: string) {
  const trip = await repos.trips.create(newTrip(title));
  const castle = await repos.schedule.create({
    tripId: trip.id,
    date: '2026-11-10',
    place: makePlace('오사카성'),
    time: '09:00',
  });
  await repos.schedule.create({ tripId: trip.id, date: null, place: makePlace('도톤보리'), memo: '저녁' });

  const [me] = await repos.companions.listByTrip(trip.id);
  const friend = await repos.companions.create({ tripId: trip.id, name: '철수' });
  await repos.expenses.create({
    tripId: trip.id,
    date: '2026-11-10',
    amount: 1_200,
    currency: 'JPY',
    exchangeRate: { rate: '9.0412', source: 'manual', fetchedAt: null },
    category: 'sightseeing',
    paymentMethod: 'cash',
    payerId: me!.id,
    splitMethod: 'ratio',
    participants: [
      { companionId: me!.id, value: 2 },
      { companionId: friend.id, value: 1 },
    ],
    memo: '천수각 입장권',
    scheduleItemId: castle.id,
  });
  await repos.settlements.create({ tripId: trip.id, fromId: friend.id, toId: me!.id, amount: 3_000 });
  return trip;
}

describe('LocalBackupRepository', () => {
  it('restores an export into an empty database', async () => {
    const source = freshRepos();
    await seed(source, '여행 A');
    await seed(source, '여행 B');

    const target = freshRepos();
    const summary = await target.backup.importAll(viaJson(await source.backup.exportAll()), 'overwrite');

    expect(summary.trips.added).toBe(2);
    expect(summary.scheduleItems.added).toBe(4);
    expect(await dump(target)).toEqual(await dump(source));
  });

  it('merges: preview matches the import, and merging twice changes nothing', async () => {
    const phone = freshRepos();
    const shared = await seed(phone, '같이 있는 여행');
    const file = viaJson(await phone.backup.exportAll());
    await phone.trips.update(shared.id, { title: '폰에서 고친 제목' });
    await seed(phone, '폰에만 있는 여행');

    const laptop = freshRepos();
    await laptop.backup.importAll(file, 'overwrite');
    await seed(laptop, '노트북에만 있는 여행');
    const laptopFile = viaJson(await laptop.backup.exportAll());

    const preview = await phone.backup.previewImport(laptopFile, 'merge');
    expect(preview.trips).toEqual({ added: 1, updated: 0, kept: 1, removed: 0 });
    expect(await phone.backup.importAll(laptopFile, 'merge')).toEqual(preview);

    const merged = await dump(phone);
    expect(merged.trips.map((trip) => trip.title).sort()).toEqual([
      '노트북에만 있는 여행',
      '폰에만 있는 여행',
      '폰에서 고친 제목',
    ]);
    expect(merged.items).toHaveLength(6);

    const again = await phone.backup.importAll(laptopFile, 'merge');
    expect(again.trips).toEqual({ added: 0, updated: 0, kept: 2, removed: 0 });
    expect(await dump(phone)).toEqual(merged);
  });

  it('overwrite removes local data that is not in the file', async () => {
    const repos = freshRepos();
    await seed(repos, '남길 여행');
    const file = viaJson(await repos.backup.exportAll());
    await seed(repos, '사라질 여행');

    const summary = await repos.backup.importAll(file, 'overwrite');

    expect(summary.trips).toEqual({ added: 1, updated: 0, kept: 0, removed: 2 });
    expect((await repos.trips.list()).map((trip) => trip.title)).toEqual(['남길 여행']);
  });
});
