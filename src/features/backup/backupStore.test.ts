import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TravelGoDB } from '@/data/local';
import type { Repositories } from '@/data/repositories';
import { createBackupFile } from '@/data/rules/backupFormat';
import { createBackupStore } from '@/features/backup/backupStore';
import { backupData, createTestRepositories, makeTrip, T0 } from '@/test/fixtures';

const dbs: TravelGoDB[] = [];

function freshRepos(): Repositories {
  const { db, repos } = createTestRepositories();
  dbs.push(db);
  return repos;
}

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()));
});

/** localStorage stand-in. */
function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  } as Storage;
}

describe('backup store', () => {
  it('remembers on the device when a backup last left it', () => {
    const repos = freshRepos();
    const storage = memoryStorage();
    const store = createBackupStore(repos, { storage: () => storage });
    expect(store.getState().lastExportedAt).toBeNull();

    store.getState().markExported('2026-11-03T05:20:00.000Z');

    expect(store.getState().lastExportedAt).toBe('2026-11-03T05:20:00.000Z');
    const later = createBackupStore(repos, { storage: () => storage });
    expect(later.getState().lastExportedAt).toBe('2026-11-03T05:20:00.000Z');
    const garbled = memoryStorage({ 'travel-go:last-backup': 'yesterday' });
    expect(createBackupStore(repos, { storage: () => garbled }).getState().lastExportedAt).toBeNull();
    // No storage at all (blocked site data): still works for this visit.
    const blocked = createBackupStore(repos, { storage: () => undefined });
    blocked.getState().markExported('2026-11-03T05:20:00.000Z');
    expect(blocked.getState().lastExportedAt).toBe('2026-11-03T05:20:00.000Z');
  });

  it('previews without writing, and has the other stores reload after an import', async () => {
    const repos = freshRepos();
    const afterImport = vi.fn();
    const store = createBackupStore(repos, { afterImport, storage: () => undefined });
    const trip = makeTrip();
    const file = createBackupFile(backupData({ trips: [trip] }), T0);

    const preview = await store.getState().preview(file, 'merge');
    expect(preview.trips.added).toBe(1);
    expect(await repos.trips.list()).toEqual([]);
    expect(afterImport).not.toHaveBeenCalled();

    const summary = await store.getState().importFile(file, 'merge');
    expect(summary).toEqual(preview);
    expect(await repos.trips.list()).toEqual([trip]);
    expect(afterImport).toHaveBeenCalledTimes(1);

    expect((await store.getState().exportAll()).trips).toEqual([trip]);
  });
});
