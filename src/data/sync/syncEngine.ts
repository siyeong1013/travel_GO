import type { Table } from 'dexie';
import type { TravelGoDB } from '@/data/local/db';
import type { BackupData, ID, VisitedCountry } from '@/data/models';
import type { TripRole } from '@/data/sharing/sharing';
import {
  changesOf,
  dataChanged,
  dropTrip,
  dropTripsOutside,
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
import { type Clock, compareIsoDateTime, nowIso } from '@/lib/dates';

/** The server side of sync as one signed-in account reaches it (Supabase's, or a test's). */
export interface SyncServer {
  /** `sync_push`: an answer per change, in order. */
  push: (changes: SyncChange[]) => Promise<PushResult[]>;
  /** The account's rows after `seq` `after`, in `seq` order, at most `limit`. */
  pull: (after: number, limit: number) => Promise<ServerRow[]>;
  /** Like `pull`, of one trip: a trip just joined has rows from before (smaller `seq`s). */
  pullTrip: (tripId: ID, after: number, limit: number) => Promise<ServerRow[]>;
  /** The trips the account is in. */
  memberships: () => Promise<Membership[]>;
  /** The account's "다녀온 나라", those taken off too. */
  countries: () => Promise<VisitedCountry[]>;
  /** `save_visited_countries`: per country, the later `updatedAt` wins. */
  saveCountries: (countries: VisitedCountry[]) => Promise<void>;
}

export interface Membership {
  tripId: ID;
  role: TripRole;
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
  /** `userId`'s role in each of its trips on the server, as of the last sync (none if not synced). */
  roles: (userId: string) => Promise<Record<ID, TripRole>>;
  /** Takes a trip the account left off the device, without telling the server. */
  forgetTrip: (tripId: ID) => Promise<void>;
  /** Takes the account's trips and countries off the device (signing out); they stay on the server. */
  forget: () => Promise<void>;
}

const PULL_PAGE = 100;
/** Characters of JSON per push: about 4 MB (a trip with a cover photo is up to about 3.3 MB). */
const PUSH_CHARS = 4_000_000;
const PUSH_RECORDS = 200;
/** Answers can leave something to send again (a repaired schedule, a newer copy kept here). */
const PUSH_ROUNDS = 3;
const NOBODY: SyncState = { id: 'state', userId: null, cursor: 0, trips: null };

const sameRoles = (a: Record<ID, TripRole> | null, b: Record<ID, TripRole>) =>
  a !== null &&
  Object.keys(a).length === Object.keys(b).length &&
  Object.entries(b).every(([tripId, role]) => a[tripId] === role);

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
  const tables = [...Object.values(dataTables), db.syncedRecords, db.syncState, db.visitedCountries];

  // A device from before sharing has no `trips`.
  const readState = async (): Promise<SyncState> => ({ ...NOBODY, ...(await db.syncState.get('state')) });

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
    await db.visitedCountries.clear();
  }

  /**
   * The account's countries and the device's, in step: each side takes the other's later
   * changes. Resolves to whether the device's changed.
   */
  async function syncCountries(userId: string, server: SyncServer): Promise<boolean> {
    const theirs = await server.countries();
    const later = (a: VisitedCountry, b: VisitedCountry | undefined) =>
      !b || compareIsoDateTime(a.updatedAt, b.updatedAt) > 0;
    const took = await db.transaction('rw', db.syncState, db.visitedCountries, async () => {
      if ((await readState()).userId !== userId) return false;
      const mine = new Map((await db.visitedCountries.toArray()).map((c) => [c.id, c]));
      const newer = theirs.filter((country) => later(country, mine.get(country.id)));
      await db.visitedCountries.bulkPut(newer);
      return newer.length > 0;
    });
    const onServer = new Map(theirs.map((c) => [c.id, c]));
    const ours = (await db.visitedCountries.toArray()).filter((c) => later(c, onServer.get(c.id)));
    if (ours.length > 0) await server.saveCountries(ours);
    return took;
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
      await db.syncState.put({ ...NOBODY, userId });
      return someoneElses;
    });
  }

  /** All the rows after `after`, a page (`pull`) at a time. */
  async function pullAll(
    pull: (after: number, limit: number) => Promise<ServerRow[]>,
    after: number,
  ): Promise<ServerRow[]> {
    const rows: ServerRow[] = [];
    for (let cursor = after; ; ) {
      const page = await pull(cursor, PULL_PAGE);
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

        const before = await readState();
        const rows = await pullAll((after, limit) => server.pull(after, limit), before.cursor);
        // After the pull: a trip joined meanwhile is pulled whole below, not missed.
        const roles: Record<ID, TripRole> = {};
        for (const { tripId, role } of await server.memberships()) roles[tripId] = role;
        // Trips joined since the last sync (on any device): their records from before. Without a
        // list yet, the pulls covered the trips the account made: only joined ones are missing.
        const joined = Object.keys(roles).filter((tripId) =>
          before.trips ? !(tripId in before.trips) : roles[tripId] === 'member',
        );
        const joinedRows = new Map<ID, ServerRow[]>();
        for (const tripId of joined) {
          joinedRows.set(tripId, await pullAll((after, limit) => server.pullTrip(tripId, after, limit), 0));
        }

        if (rows.length > 0 || joined.length > 0 || !sameRoles(before.trips, roles)) {
          const took = await change(userId, (w, state) => {
            const taken = takeRows(w, rows);
            needsUpdate = taken.newer;
            const trips = { ...roles };
            for (const [tripId, tripRows] of joinedRows) {
              const whole = takeRows(w, tripRows);
              taken.invalid.push(...whole.invalid);
              // Stopped short: pulled whole again (after an update).
              if (whole.newer) {
                needsUpdate = true;
                delete trips[tripId];
              }
            }
            if (taken.invalid.length > 0) console.warn('[sync] skipped invalid records', taken.invalid);
            dropTripsOutside(w, roles);
            return { ...state, cursor: Math.max(state.cursor, taken.cursor ?? 0), trips };
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
            changed ||= await change(userId, (w, state) => {
              takePushResults(w, batch, plan.basedOn, results);
              const trips = { ...state.trips };
              let tripsChanged = false;
              batch.forEach((c, i) => {
                const status = results[i]?.id === c.id ? results[i].status : null;
                if (c.kind !== 'trip') return;
                if (!c.deleted && status === 'applied' && !(c.id in trips)) {
                  // Made here, so all of it is on the server now: the account owns it.
                  trips[c.id] = 'owner';
                  tripsChanged = true;
                } else if (c.deleted && status === 'forbidden' && c.id in trips) {
                  // Only its owner deletes a trip: one a member deleted comes back, pulled whole.
                  dropTrip(w, c.id);
                  delete trips[c.id];
                  tripsChanged = true;
                }
              });
              if (tripsChanged) return { ...state, trips };
            });
          }
        }
        // Apart from the trips: a server without the countries' table yet still syncs them.
        try {
          changed ||= await syncCountries(userId, server);
        } catch (error) {
          console.warn('[sync] countries', error);
        }
        return { changed, pending: await pending(), needsUpdate };
      });
    },

    pending,

    async roles(userId) {
      const state = await readState();
      return state.userId === userId ? (state.trips ?? {}) : {};
    },

    forgetTrip(tripId) {
      return exclusive(async () => {
        const { userId } = await readState();
        if (!userId) return;
        await change(userId, (w, state) => {
          dropTrip(w, tripId);
          const trips = { ...state.trips };
          delete trips[tripId];
          return { ...state, trips };
        });
      });
    },

    async forget() {
      // Not queued behind a sync: one still running finds the device no longer the account's.
      await db.transaction('rw', tables, async () => {
        await clearAll();
        await db.syncState.put(NOBODY);
      });
    },
  };
}
