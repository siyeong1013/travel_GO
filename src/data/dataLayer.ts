import { createLocalRepositories, type TravelGoDB } from '@/data/local';
import type { Repositories } from '@/data/repositories';
import { createSyncEngine, type SyncEngine, type SyncServer } from '@/data/sync/syncEngine';
import { watchWrites } from '@/data/sync/watchWrites';
import { type Clock, nowIso } from '@/lib/dates';

export interface DataLayer {
  repositories: Repositories;
  syncEngine: SyncEngine;
  /** Calls `listener` after every change the app makes to its data. Returns the unsubscribe. */
  onLocalWrite: (listener: () => void) => () => void;
}

/** The device's database (the app reads and writes only it), synced through `connect`. */
export function createDataLayer(
  db: TravelGoDB,
  connect: (userId: string) => Promise<SyncServer>,
  now: Clock = nowIso,
): DataLayer {
  const listeners = new Set<() => void>();
  return {
    repositories: watchWrites(createLocalRepositories(db, now), () => {
      for (const listener of listeners) listener();
    }),
    syncEngine: createSyncEngine(db, connect, now),
    onLocalWrite(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
