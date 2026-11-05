import type { Table } from 'dexie';
import type { TravelGoDB } from '@/data/local/db';
import type { BackupData, ID } from '@/data/models';
import {
  changesOf,
  dataChanged,
  openWorking,
  planPush,
  type PushResult,
  repairSchedule,
  type ServerRow,
  type SyncChange,
  type SyncState,
  takePushResults,
  takeRows,
  type Working,
} from '@/data/sync/records';
import { type Clock, nowIso } from '@/lib/dates';

/** The server side of sync as one signed-in account reaches it (Supabase's, or a test's). */
export interface SyncServer {
  /** `sync_push`: an answer per change, in order. */
  push: (changes: SyncChange[]) => Promise<PushResult[]>;
  /** The account's rows after `seq` `after`, in `seq` order, at most `limit`. */
  pull: (after: number, limit: number) => Promise<ServerRow[]>;
}

export interface SyncOutcome {
  /** The device's trips changed: screens should read them again. */
  changed: boolean;
  /** Changes here the server still doesn't have. */
  pending: number;
  /** The server has records from a newer version of the app, which this one can't read. */
  needsUpdate: boolean;
}

export interface SyncEngine {
  /**
   * Brings the device and `userId`'s account in step: takes what changed on the server, then
   * sends what changed here. The first time, the device's trips become the account's (another
   * account's trips are taken off it first).
   */
  sync: (userId: string) => Promise<SyncOutcome>;
  /** How many changes here the server doesn't have yet. */
  pending: () => Promise<number>;
  /** Takes the account's trips off the device (signing out); they stay on the server. */
  forget: () => Promise<void>;
}

const PULL_PAGE = 100;
/** Characters of JSON per push: about 4 MB (a trip with a cover photo is up to about 3.3 MB). */
const PUSH_CHARS = 4_000_000;
const PUSH_RECORDS = 200;
/** Answers can leave something to send again (a repaired schedule, a newer copy kept here). */
const PUSH_ROUNDS = 3;
const NOBODY: SyncState = { id: 'state', userId: null, cursor: 0 };

/** `changes` in pushes of a size the server takes, in order (trips first). */
function batches(changes: SyncChange[]): SyncChange[][] {
  const result: SyncChange[][] = [];
  let batch: SyncChange[] = [];
  let size = 0;
  for (const change of changes) {
    const length = JSON.stringify(change).length;
    if (batch.length > 0 && (size + length > PUSH_CHARS || batch.length >= PUSH_RECORDS)) {
      result.push(batch);
      batch = [];
      size = 0;
    }
    batch.push(change);
    size += length;
  }
  if (batch.length > 0) result.push(batch);
  return result;
}

export function createSyncEngine(
  db: TravelGoDB,
  connect: (userId: string) => Promise<SyncServer>,
  now: Clock = nowIso,
): SyncEngine {
  const dataTables: Record<keyof BackupData, Table<{ id: ID }, ID>> = {
    trips: db.trips,
    scheduleItems: db.scheduleItems,
    companions: db.companions,
    expenses: db.expenses,
    expenseShares: db.expenseShares,
    settlements: db.settlements,
  };
  const tables = [...Object.values(dataTables), db.syncedRecords, db.syncState];

  const readState = async () => (await db.syncState.get('state')) ?? NOBODY;

  async function readWorking(): Promise<Working> {
    const data: BackupData = {
      trips: await db.trips.toArray(),
      scheduleItems: await db.scheduleItems.toArray(),
      companions: await db.companions.toArray(),
      expenses: await db.expenses.toArray(),
      expenseShares: await db.expenseShares.toArray(),
      settlements: await db.settlements.toArray(),
    };
    return openWorking(data, await db.syncedRecords.toArray());
  }

  async function clearAll() {
    for (const records of Object.values(dataTables)) await records.clear();
    await db.syncedRecords.clear();
  }

  /**
   * Changes the device's records in one transaction while they are still `userId`'s (a sign-out
   * meanwhile wins), then repairs the schedules that took changes. `work` may return a new state.
   * Resolves to whether the trips changed.
   */
  function change(
    userId: string,
    work: (w: Working, state: SyncState) => SyncState | void,
  ): Promise<boolean> {
    return db.transaction('rw', tables, async () => {
      const state = await readState();
      if (state.userId !== userId) return false;
      const w = await readWorking();
      const next = work(w, state);
      repairSchedule(w, now());
      const changes = changesOf(w);
      for (const [name, diff] of Object.entries(changes.data)) {
        const records = dataTables[name as keyof BackupData];
        await records.bulkDelete(diff.remove);
        await records.bulkPut(diff.put);
      }
      await db.syncedRecords.bulkDelete(changes.synced.remove);
      await db.syncedRecords.bulkPut(changes.synced.put);
      if (next) await db.syncState.put(next);
      return dataChanged(changes);
    });
  }

  /** Makes the device's trips `userId`'s; another account's are taken off it first. */
  function adopt(userId: string): Promise<boolean> {
    return db.transaction('rw', tables, async () => {
      const state = await readState();
      if (state.userId === userId) return false;
      const someoneElses = state.userId !== null;
      if (someoneElses) await clearAll();
      await db.syncState.put({ id: 'state', userId, cursor: 0 });
      return someoneElses;
    });
  }

  async function pullAll(server: SyncServer, after: number): Promise<ServerRow[]> {
    const rows: ServerRow[] = [];
    for (let cursor = after; ; ) {
      const page = await server.pull(cursor, PULL_PAGE);
      rows.push(...page);
      const last = page.at(-1)?.seq;
      if (page.length < PULL_PAGE || last === undefined || last <= cursor) return rows;
      cursor = last;
    }
  }

  function pending(): Promise<number> {
    return db.transaction('r', tables, async () => planPush(await readWorking(), now()).changes.length);
  }

  /** One sync at a time, also across this app's tabs where the browser can tell. */
  let queue: Promise<unknown> = Promise.resolve();
  function exclusive<T>(work: () => Promise<T>): Promise<T> {
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
    const run = () => (locks ? locks.request('travel-go:sync', work) : work());
    const next = queue.then(run, run);
    queue = next.catch(() => {});
    return next;
  }

  return {
    sync(userId) {
      return exclusive(async () => {
        const server = await connect(userId);
        let changed = await adopt(userId);
        let needsUpdate = false;

        const rows = await pullAll(server, (await readState()).cursor);
        if (rows.length > 0) {
          const took = await change(userId, (w, state) => {
            const taken = takeRows(w, rows);
            needsUpdate = taken.newer;
            if (taken.invalid.length > 0) console.warn('[sync] skipped invalid records', taken.invalid);
            if (taken.cursor === null) return;
            return { ...state, cursor: Math.max(state.cursor, taken.cursor) };
          });
          changed ||= took;
        }

        // Changes the server turned down for a reason sending again won't fix (this time).
        const refused = new Set<ID>();
        for (let round = 0; round < PUSH_ROUNDS; round++) {
          const plan = await db.transaction('r', tables, async () => planPush(await readWorking(), now()));
          const changes = plan.changes.filter((c) => !refused.has(c.id));
          if (changes.length === 0) break;
          for (const batch of batches(changes)) {
            const results = await server.push(batch);
            for (const result of results) {
              if (!['applied', 'stale', 'gone'].includes(result.status)) {
                refused.add(result.id);
                console.warn(`[sync] ${result.status}: ${result.id}`);
              }
            }
            changed ||= await change(userId, (w) => {
              takePushResults(w, batch, plan.basedOn, results);
            });
          }
        }
        return { changed, pending: await pending(), needsUpdate };
      });
    },

    pending,

    async forget() {
      // Not queued behind a sync: one still running finds the device no longer the account's.
      await db.transaction('rw', tables, async () => {
        await clearAll();
        await db.syncState.put(NOBODY);
      });
    },
  };
}
