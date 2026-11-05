import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSyncDatabase, type SyncDatabase } from '@/test/syncDatabase';

// The server side of sync (supabase/migrations/*_sync.sql) on a real Postgres (PGlite).

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const TRIP = '11111111-0000-4000-8000-000000000001';
const OTHER_TRIP = '11111111-0000-4000-8000-000000000002';
const ITEM = '22222222-0000-4000-8000-000000000001';
const T1 = '2026-11-05T01:00:00.000Z';
const T2 = '2026-11-05T02:00:00.000Z';
const T3 = '2026-11-05T03:00:00.000Z';

interface Change {
  id: string;
  tripId: string;
  kind: string;
  format: number;
  updatedAt: string;
  deleted: boolean;
  data?: Record<string, unknown>;
}

const trip = (id: string, updatedAt: string, title = 'Osaka'): Change => ({
  id,
  tripId: id,
  kind: 'trip',
  format: 4,
  updatedAt,
  deleted: false,
  data: { id, title, updatedAt },
});

const item = (id: string, tripId: string, updatedAt: string, memo = ''): Change => ({
  id,
  tripId,
  kind: 'scheduleItem',
  format: 4,
  updatedAt,
  deleted: false,
  data: { id, tripId, memo, updatedAt },
});

const deletion = (kind: string, id: string, tripId: string, updatedAt: string): Change => ({
  id,
  tripId,
  kind,
  format: 4,
  updatedAt,
  deleted: true,
});

interface Result {
  id: string;
  status: string;
  current?: { data: Record<string, unknown> | null; format: number; updatedAt: string; deleted: boolean };
}

interface Row {
  id: string;
  kind: string;
  deleted: boolean;
  seq: number;
  data: Record<string, unknown> | null;
}

let server: SyncDatabase;

beforeEach(async () => {
  server = await createSyncDatabase();
  await server.addUser(A);
  await server.addUser(B);
});
afterEach(() => server.close());

function push(user: string | null, changes: unknown): Promise<Result[]> {
  return server.as(user, async (tx) => {
    const { rows } = await tx.query<{ result: Result[] }>('select public.sync_push($1::jsonb) as result', [
      JSON.stringify(changes),
    ]);
    return rows[0]!.result;
  });
}

const statuses = (results: Result[]) => results.map((r) => r.status);

/** The rows `user` can read after `since`, as a device's pull asks for them. */
function pull(user: string, since = 0): Promise<Row[]> {
  return server.as(user, async (tx) => {
    const { rows } = await tx.query<Row>(
      'select id, kind, deleted, seq::integer as seq, data from public.records where seq > $1 order by seq',
      [since],
    );
    return rows;
  });
}

describe('sync_push', () => {
  it('needs a signed-in account', async () => {
    await expect(push(null, [trip(TRIP, T1)])).rejects.toThrow(/permission denied|sign in/);
    await expect(
      server.as(null, (tx) => tx.query('select * from public.records')),
    ).rejects.toThrow(/permission denied/);
  });

  it('stores a new trip as the uploader’s, then what is in it', async () => {
    expect(statuses(await push(A, [trip(TRIP, T1), item(ITEM, TRIP, T1)]))).toEqual([
      'applied',
      'applied',
    ]);
    const rows = await pull(A);
    expect(rows.map((r) => [r.id, r.kind])).toEqual([
      [TRIP, 'trip'],
      [ITEM, 'scheduleItem'],
    ]);
    expect(rows[0]!.seq).toBeLessThan(rows[1]!.seq);
    const members = await server.as(A, (tx) => tx.query('select trip_id, role from public.trip_members'));
    expect(members.rows).toEqual([{ trip_id: TRIP, role: 'owner' }]);
  });

  it('takes nothing for a trip it doesn’t have yet', async () => {
    expect(statuses(await push(A, [item(ITEM, TRIP, T1)]))).toEqual(['no_trip']);
    expect(await pull(A)).toEqual([]);
  });

  it('keeps another account out', async () => {
    await push(A, [trip(TRIP, T1), item(ITEM, TRIP, T1)]);
    expect(await pull(B)).toEqual([]);
    expect(
      statuses(await push(B, [trip(TRIP, T2, 'Mine'), item(ITEM, TRIP, T2), deletion('trip', TRIP, TRIP, T2)])),
    ).toEqual(['forbidden', 'forbidden', 'forbidden']);
    // An id of A's, put in a trip of B's own.
    await push(B, [trip(OTHER_TRIP, T1)]);
    expect(statuses(await push(B, [item(ITEM, OTHER_TRIP, T2)]))).toEqual(['invalid']);
    expect((await pull(A)).map((r) => r.data?.updatedAt)).toEqual([T1, T1]);
  });

  it('keeps the later change of a record, and says what it has otherwise', async () => {
    await push(A, [trip(TRIP, T1), item(ITEM, TRIP, T2, 'later')]);
    const [older] = await push(A, [item(ITEM, TRIP, T1, 'earlier')]);
    expect(older).toMatchObject({
      status: 'stale',
      current: { deleted: false, format: 4, data: { memo: 'later' } },
    });
    expect(Date.parse(older!.current!.updatedAt)).toBe(Date.parse(T2));
    // The same change again (its answer was lost, say) is no news either.
    expect(statuses(await push(A, [item(ITEM, TRIP, T2, 'later')]))).toEqual(['stale']);
    expect(statuses(await push(A, [item(ITEM, TRIP, T3, 'latest')]))).toEqual(['applied']);
    expect((await pull(A)).find((r) => r.id === ITEM)?.data?.memo).toBe('latest');
  });

  it('doesn’t let an older app version overwrite a newer one’s record', async () => {
    await push(A, [trip(TRIP, T1), { ...item(ITEM, TRIP, T1), format: 5 }]);
    expect(statuses(await push(A, [item(ITEM, TRIP, T2)]))).toEqual(['stale']);
  });

  it('keeps a deleted record as a row without data, after what was read before', async () => {
    await push(A, [trip(TRIP, T1), item(ITEM, TRIP, T1)]);
    const seen = Math.max(...(await pull(A)).map((r) => r.seq));
    expect(statuses(await push(A, [deletion('scheduleItem', ITEM, TRIP, T2)]))).toEqual(['applied']);
    expect(await pull(A, seen)).toEqual([
      { id: ITEM, kind: 'scheduleItem', deleted: true, seq: seen + 1, data: null },
    ]);
    // A record the server never had: nothing to keep.
    const NEVER = '22222222-0000-4000-8000-000000000009';
    expect(statuses(await push(A, [deletion('scheduleItem', NEVER, TRIP, T2)]))).toEqual(['applied']);
    expect((await pull(A)).some((r) => r.id === NEVER)).toBe(false);
  });

  it('brings a deleted record back with a later change', async () => {
    await push(A, [trip(TRIP, T1), item(ITEM, TRIP, T1)]);
    await push(A, [deletion('scheduleItem', ITEM, TRIP, T2)]);
    expect(statuses(await push(A, [item(ITEM, TRIP, T3, 'back')]))).toEqual(['applied']);
    expect((await pull(A)).find((r) => r.id === ITEM)).toMatchObject({ deleted: false, data: { memo: 'back' } });
  });

  it('deletes a trip with everything in it, for good', async () => {
    await push(A, [trip(TRIP, T2), item(ITEM, TRIP, T1)]);
    // Even when the trip was changed after the time the deletion carries.
    expect(statuses(await push(A, [deletion('trip', TRIP, TRIP, T1)]))).toEqual(['applied']);
    expect(await pull(A)).toEqual([expect.objectContaining({ id: TRIP, deleted: true, data: null })]);
    expect(statuses(await push(A, [item(ITEM, TRIP, T3), trip(TRIP, T3)]))).toEqual(['gone', 'gone']);
  });

  it('turns down malformed changes without dropping the rest', async () => {
    await push(A, [trip(TRIP, T1)]);
    const results = await push(A, [
      { ...item(ITEM, TRIP, T2), id: 'not-a-uuid' },
      { ...item(ITEM, TRIP, T2), data: { id: ITEM, tripId: TRIP, updatedAt: T1 } },
      { ...item(ITEM, TRIP, T2), data: { id: ITEM, tripId: OTHER_TRIP, updatedAt: T2 } },
      { ...item(ITEM, TRIP, T2), kind: 'photo' },
      { ...trip(OTHER_TRIP, T2), tripId: TRIP },
      item(ITEM, TRIP, T2),
    ]);
    expect(statuses(results)).toEqual(['invalid', 'invalid', 'invalid', 'invalid', 'invalid', 'applied']);
    expect(results[0]!.id).toBe('not-a-uuid');
    await expect(push(A, { not: 'a list' })).rejects.toThrow(/array/);
  });

  it('allows no writes but its own', async () => {
    await expect(
      server.as(A, (tx) =>
        tx.query(
          `insert into public.records (id, trip_id, kind, data, format, updated_at, seq)
           values ($1, $1, 'trip', '{}', 4, now(), 1)`,
          [TRIP],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      server.as(A, (tx) => tx.query('insert into public.trip_members values ($1, $2, $3)', [TRIP, A, 'owner'])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('expire_place_data', () => {
  it('drops Google’s place data once it is 30 days old, without making it news', async () => {
    const day = 24 * 60 * 60 * 1000;
    const daysAgo = (n: number) => new Date(Date.now() - n * day).toISOString();
    const placed = (id: string, fetchedAt: string): Change => {
      const change = item(id, TRIP, T1);
      return {
        ...change,
        data: {
          ...change.data,
          place: { placeId: 'p', name: 'Osaka Castle', address: 'Osaka', location: { lat: 1, lng: 2 }, fetchedAt },
        },
      };
    };
    const OLD = '22222222-0000-4000-8000-000000000001';
    const NEW = '22222222-0000-4000-8000-000000000002';
    const city = { name: 'Osaka', placeId: 'c', location: { lat: 1, lng: 2 }, fetchedAt: daysAgo(31) };
    await push(A, [
      { ...trip(TRIP, T1), data: { ...trip(TRIP, T1).data, city } },
      placed(OLD, daysAgo(31)),
      placed(NEW, daysAgo(10)),
    ]);
    const before = await pull(A);

    await server.db.query('select private.expire_place_data()');

    const after = await pull(A);
    expect(after.map((r) => r.seq)).toEqual(before.map((r) => r.seq));
    const byId = new Map(after.map((r) => [r.id, r.data]));
    expect(byId.get(TRIP)?.city).toEqual({ name: 'Osaka', placeId: 'c', location: null, fetchedAt: null });
    expect(byId.get(OLD)?.place).toEqual({
      placeId: 'p',
      name: 'Osaka Castle',
      address: null,
      location: null,
      fetchedAt: null,
    });
    expect(byId.get(NEW)?.place).toMatchObject({ address: 'Osaka', location: { lat: 1, lng: 2 } });
  });
});
