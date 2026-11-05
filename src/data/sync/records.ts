import type {
  BackupData,
  Companion,
  Expense,
  ExpenseShare,
  ID,
  ISODateTime,
  RecordKind,
  RecordsByKind,
  ScheduleItem,
  Settlement,
  Trip,
} from '@/data/models';
import { BACKUP_SCHEMA_VERSION, parseRecord } from '@/data/rules/backupFormat';
import type { TripRole } from '@/data/sharing/sharing';
import { normalizeSchedule } from '@/data/rules/schedule';
import { compareIsoDateTime } from '@/lib/dates';

// Syncing the device's records with the account's copy on the server
// (supabase/migrations/*_sync.sql). Pure: the engine (syncEngine.ts) reads the device's records
// into a `Working` set, runs these on it, and writes back what changed.
//
// - `synced` holds, per record, the `updatedAt` the server has (as far as this device knows). A
//   record whose `updatedAt` differs, or that is gone here, has changes to push.
// - Per record the later `updatedAt` wins, as in backup merges. A deleted trip always wins and
//   takes everything in it along.

/** The app's data format; the server keeps it per record so an older app can't overwrite a newer one's. */
export const SYNC_FORMAT = BACKUP_SCHEMA_VERSION;

/** In push order: a trip before what is in it. */
export const RECORD_KINDS: readonly RecordKind[] = [
  'trip',
  'scheduleItem',
  'companion',
  'expense',
  'settlement',
];

/** What the server has of a record, as this device last saw it. */
export interface SyncedRecord {
  id: ID;
  tripId: ID;
  kind: RecordKind;
  /** The record's `updatedAt`, or when the server recorded its deletion. */
  updatedAt: ISODateTime;
}

/** Whose trips this device holds, and how far it has read the server's changes. */
export interface SyncState {
  id: 'state';
  /** The account whose trips these are; null: nobody's (never synced, or signed out). */
  userId: string | null;
  /** The last `seq` read from the server. */
  cursor: number;
  /**
   * The account's trips on the server that this device has all the records of, with its role in
   * each. A trip joined since has records from before `cursor`: they are pulled on their own.
   * Null until the first pull (or on a device from before sharing, whose pulls covered all).
   */
  trips: Record<ID, TripRole> | null;
}

/** A change for the server (`sync_push`). */
export interface SyncChange {
  id: ID;
  tripId: ID;
  kind: RecordKind;
  format: number;
  updatedAt: ISODateTime;
  deleted: boolean;
  /** The record (an expense with its shares); absent for a deletion. */
  data?: RecordsByKind[RecordKind];
}

export type PushStatus = 'applied' | 'stale' | 'gone' | 'no_trip' | 'forbidden' | 'invalid';

/** The server's answer for one change; `current` is what it has instead (`stale`). */
export interface PushResult {
  id: ID;
  status: PushStatus;
  current?: { data: unknown; format: number; updatedAt: ISODateTime; deleted: boolean };
}

/** A row of the server's `records`, as a pull reads it. */
export interface ServerRow {
  id: ID;
  trip_id: ID;
  kind: string;
  data: unknown;
  format: number;
  updated_at: ISODateTime;
  deleted: boolean;
  seq: number;
}

/** A record from the server after checking. */
export type Incoming =
  | { kind: RecordKind; id: ID; tripId: ID; updatedAt: ISODateTime; deleted: true }
  | {
      kind: RecordKind;
      id: ID;
      tripId: ID;
      updatedAt: ISODateTime;
      deleted: false;
      record: RecordsByKind[RecordKind];
    };

type Stored = Trip | ScheduleItem | Companion | Expense | Settlement;

/** The device's records while a sync changes them, and how they were (`base`). */
export interface Working {
  trips: Map<ID, Trip>;
  scheduleItems: Map<ID, ScheduleItem>;
  companions: Map<ID, Companion>;
  expenses: Map<ID, Expense>;
  expenseShares: Map<ID, ExpenseShare>;
  settlements: Map<ID, Settlement>;
  synced: Map<ID, SyncedRecord>;
  /** Trips whose items or dates came in: their schedule may need repairing. */
  touched: Set<ID>;
  base: { data: BackupData; synced: SyncedRecord[] };
}

const TABLES = {
  trip: 'trips',
  scheduleItem: 'scheduleItems',
  companion: 'companions',
  expense: 'expenses',
  settlement: 'settlements',
} as const satisfies Record<RecordKind, keyof BackupData>;

const table = (w: Working, kind: RecordKind) => w[TABLES[kind]] as Map<ID, Stored>;

const tripIdOf = (kind: RecordKind, record: { id: ID; tripId?: ID }): ID =>
  kind === 'trip' ? record.id : record.tripId!;

const later = (a: ISODateTime, b: ISODateTime) => compareIsoDateTime(a, b) > 0;

const justAfter = (time: ISODateTime) => new Date(Date.parse(time) + 1).toISOString();

export function openWorking(data: BackupData, synced: SyncedRecord[]): Working {
  const byId = <T extends { id: ID }>(records: T[]) => new Map(records.map((r) => [r.id, r]));
  return {
    trips: byId(data.trips),
    scheduleItems: byId(data.scheduleItems),
    companions: byId(data.companions),
    expenses: byId(data.expenses),
    expenseShares: byId(data.expenseShares),
    settlements: byId(data.settlements),
    synced: byId(synced),
    touched: new Set(),
    base: { data, synced },
  };
}

type Diff = { put: unknown[]; remove: ID[] };

/** What to write for the changes made to `w`, per table. */
export interface WorkingChanges {
  data: { [K in keyof BackupData]: { put: BackupData[K]; remove: ID[] } };
  synced: { put: SyncedRecord[]; remove: ID[] };
}

export function changesOf(w: Working): WorkingChanges {
  const diff = <T extends { id: ID }>(before: T[], after: Map<ID, T>) => {
    const old = new Map(before.map((record) => [record.id, record]));
    return {
      put: [...after.values()].filter((record) => old.get(record.id) !== record),
      remove: before.filter((record) => !after.has(record.id)).map((record) => record.id),
    };
  };
  const { data, synced } = w.base;
  return {
    data: {
      trips: diff(data.trips, w.trips),
      scheduleItems: diff(data.scheduleItems, w.scheduleItems),
      companions: diff(data.companions, w.companions),
      expenses: diff(data.expenses, w.expenses),
      expenseShares: diff(data.expenseShares, w.expenseShares),
      settlements: diff(data.settlements, w.settlements),
    },
    synced: diff(synced, w.synced),
  };
}

/** Whether the trips themselves changed (not only what the device knows of the server). */
export function dataChanged(changes: WorkingChanges): boolean {
  return Object.values(changes.data).some((d: Diff) => d.put.length > 0 || d.remove.length > 0);
}

function sharesOf(w: Working, expenseId: ID): ExpenseShare[] {
  return [...w.expenseShares.values()].filter((share) => share.expenseId === expenseId);
}

function removeShares(w: Working, expenseId: ID) {
  for (const share of sharesOf(w, expenseId)) w.expenseShares.delete(share.id);
}

function putRecord(w: Working, kind: RecordKind, record: RecordsByKind[RecordKind]) {
  if (kind === 'expense') {
    const { shares, ...expense } = record as RecordsByKind['expense'];
    removeShares(w, expense.id);
    w.expenses.set(expense.id, expense);
    for (const share of shares) w.expenseShares.set(share.id, share);
    return;
  }
  table(w, kind).set(record.id, record as Stored);
  if (kind === 'trip' || kind === 'scheduleItem') w.touched.add(tripIdOf(kind, record as Stored));
}

/** Removes a record from the device; a trip with everything in it, and what is known of them. */
function removeRecord(w: Working, kind: RecordKind, id: ID) {
  if (kind === 'trip') {
    w.trips.delete(id);
    for (const records of [w.scheduleItems, w.companions, w.expenses, w.expenseShares, w.settlements]) {
      for (const [key, record] of records) if (record.tripId === id) records.delete(key);
    }
    for (const [key, entry] of w.synced) if (entry.tripId === id) w.synced.delete(key);
    return;
  }
  const record = table(w, kind).get(id);
  if (!record) return;
  if (kind === 'expense') removeShares(w, id);
  table(w, kind).delete(id);
  if (kind === 'scheduleItem') w.touched.add(tripIdOf(kind, record));
}

/**
 * Takes off the device the trips the server has (as far as it knows) that the account is no
 * longer in: it left them, or their owner took it out. Trips not on the server yet stay.
 */
export function dropTripsOutside(w: Working, roles: Record<ID, TripRole>) {
  const onServer = new Set([...w.synced.values()].map((entry) => entry.tripId));
  for (const tripId of onServer) if (!(tripId in roles)) removeRecord(w, 'trip', tripId);
}

/** Takes a trip off the device without telling the server (the account left it). */
export function dropTrip(w: Working, tripId: ID) {
  removeRecord(w, 'trip', tripId);
}

function know(w: Working, entry: SyncedRecord) {
  if (w.synced.get(entry.id)?.updatedAt !== entry.updatedAt) w.synced.set(entry.id, entry);
}

/** Takes a record from the server into the device's records: the later change wins. */
function take(w: Working, incoming: Incoming) {
  const { kind, id, tripId, updatedAt } = incoming;
  if (kind === 'trip' && incoming.deleted) {
    removeRecord(w, 'trip', id);
    return;
  }
  // A trip deleted here, not yet on the server: what comes for it doesn't matter.
  if (!w.trips.has(tripId) && w.synced.get(tripId)?.kind === 'trip') return;

  const local = table(w, kind).get(id);
  const known = w.synced.get(id);
  const entry: SyncedRecord = { id, tripId, kind, updatedAt };
  if (incoming.deleted) {
    // A later edit here keeps it (and brings it back on the server).
    if (local && known?.updatedAt !== local.updatedAt && later(local.updatedAt, updatedAt)) {
      know(w, entry);
    } else {
      removeRecord(w, kind, id);
      w.synced.delete(id);
    }
    return;
  }
  if (!local) {
    // Deleted here since the last sync: stays deleted unless it was changed elsewhere since.
    if (known && !later(updatedAt, known.updatedAt)) return;
    putRecord(w, kind, incoming.record);
  } else if (updatedAt !== local.updatedAt) {
    const changedHere = known?.updatedAt !== local.updatedAt;
    if (!changedHere || later(updatedAt, local.updatedAt)) putRecord(w, kind, incoming.record);
  }
  know(w, entry);
}

/** Checks a record from the server (a pulled row, or what a push was told is there instead). */
export function readIncoming(raw: {
  id: ID;
  tripId: ID;
  kind: string;
  data: unknown;
  format: number;
  updatedAt: ISODateTime;
  deleted: boolean;
}): Incoming | 'invalid' | 'newer' {
  const kind = RECORD_KINDS.find((k) => k === raw.kind);
  if (!kind) return 'invalid';
  if (raw.format > SYNC_FORMAT) return 'newer';
  const { id, tripId } = raw;
  if (raw.deleted) return { kind, id, tripId, updatedAt: raw.updatedAt, deleted: true };
  try {
    const record = parseRecord(kind, raw.data, raw.format);
    if (record.id !== id || tripIdOf(kind, record) !== tripId) return 'invalid';
    return { kind, id, tripId, updatedAt: record.updatedAt, deleted: false, record };
  } catch {
    return 'invalid';
  }
}

export interface TakenRows {
  /** The `seq` of the last row taken; null when none was. */
  cursor: number | null;
  /** Stopped at a row in a newer format than this app's (it needs updating). */
  newer: boolean;
  /** Rows that didn't check out, skipped. */
  invalid: ID[];
}

/** Takes pulled rows in `seq` order, up to one this app can't read. */
export function takeRows(w: Working, rows: ServerRow[]): TakenRows {
  const taken: TakenRows = { cursor: null, newer: false, invalid: [] };
  for (const row of rows) {
    const incoming = readIncoming({
      id: row.id,
      tripId: row.trip_id,
      kind: row.kind,
      data: row.data,
      format: row.format,
      updatedAt: row.updated_at,
      deleted: row.deleted,
    });
    if (incoming === 'newer') {
      taken.newer = true;
      break;
    }
    if (incoming === 'invalid') taken.invalid.push(row.id);
    else take(w, incoming);
    taken.cursor = row.seq;
  }
  return taken;
}

export interface PushPlan {
  changes: SyncChange[];
  /** The `updatedAt` each pushed record had here: an edit made since leaves it different. */
  basedOn: Map<ID, ISODateTime>;
}

/** What the server doesn't have yet: changed records (trips first), then deletions. */
export function planPush(w: Working, now: ISODateTime): PushPlan {
  const changes: SyncChange[] = [];
  const basedOn = new Map<ID, ISODateTime>();
  for (const kind of RECORD_KINDS) {
    for (const record of table(w, kind).values()) {
      const known = w.synced.get(record.id);
      if (known?.updatedAt === record.updatedAt) continue;
      // An edit of what the server has is newer than it, whatever this device's clock says.
      const updatedAt =
        known && !later(record.updatedAt, known.updatedAt)
          ? justAfter(known.updatedAt)
          : record.updatedAt;
      const data =
        kind === 'expense' ? { ...record, shares: sharesOf(w, record.id) } : { ...record };
      changes.push({
        id: record.id,
        tripId: tripIdOf(kind, record),
        kind,
        format: SYNC_FORMAT,
        updatedAt,
        deleted: false,
        data: { ...data, updatedAt } as RecordsByKind[RecordKind],
      });
      basedOn.set(record.id, record.updatedAt);
    }
  }

  const gone = [...w.synced.values()].filter((entry) => !table(w, entry.kind).has(entry.id));
  const goneTrips = new Set(gone.filter((entry) => entry.kind === 'trip').map((entry) => entry.id));
  const deletion = (entry: SyncedRecord): SyncChange => ({
    id: entry.id,
    tripId: entry.tripId,
    kind: entry.kind,
    format: SYNC_FORMAT,
    updatedAt: later(now, entry.updatedAt) ? now : justAfter(entry.updatedAt),
    deleted: true,
  });
  // A deleted trip's records go with it on the server.
  changes.push(
    ...gone.filter((entry) => entry.kind !== 'trip' && !goneTrips.has(entry.tripId)).map(deletion),
    ...gone.filter((entry) => entry.kind === 'trip').map(deletion),
  );
  return { changes, basedOn };
}

/** Takes the server's answers to pushed `changes` (same order). */
export function takePushResults(
  w: Working,
  changes: SyncChange[],
  basedOn: Map<ID, ISODateTime>,
  results: PushResult[],
) {
  changes.forEach((change, i) => {
    const result = results[i];
    if (!result || result.id !== change.id) return;
    const { id, tripId, kind } = change;
    switch (result.status) {
      case 'applied': {
        if (change.deleted) {
          w.synced.delete(id);
          if (kind === 'trip') {
            for (const [key, entry] of w.synced) if (entry.tripId === id) w.synced.delete(key);
          }
          return;
        }
        // Sent a little later than it was here (see planPush): the device takes that time too,
        // unless it was edited again meanwhile.
        const local = table(w, kind).get(id);
        if (local && local.updatedAt === basedOn.get(id) && local.updatedAt !== change.updatedAt) {
          table(w, kind).set(id, { ...local, updatedAt: change.updatedAt });
        }
        know(w, { id, tripId, kind, updatedAt: change.updatedAt });
        return;
      }
      case 'stale': {
        if (!result.current) return;
        const incoming = readIncoming({ id, tripId, kind, ...result.current });
        if (incoming !== 'invalid' && incoming !== 'newer') take(w, incoming);
        return;
      }
      case 'gone':
        removeRecord(w, 'trip', tripId);
        return;
      default:
      // no_trip, forbidden, invalid: stays to push; nothing here can fix it.
    }
  });
}

/** Repairs the schedule of trips that took changes (`normalizeSchedule`): conflicting orders, items outside the dates. */
export function repairSchedule(w: Working, now: ISODateTime) {
  for (const tripId of w.touched) {
    const trip = w.trips.get(tripId);
    if (!trip) continue;
    const items = [...w.scheduleItems.values()].filter((item) => item.tripId === tripId);
    for (const item of normalizeSchedule([trip], items, now).changed) {
      w.scheduleItems.set(item.id, item);
    }
  }
  w.touched.clear();
}
