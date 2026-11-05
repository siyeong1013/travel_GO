import { PGlite, type Transaction } from '@electric-sql/pglite';
import { createSharingServer, type SharingServer, type TripRole } from '@/data/sharing/sharing';
import type { PushResult, ServerRow } from '@/data/sync/records';
import type { SyncServer } from '@/data/sync/syncEngine';
import sharingMigration from '../../supabase/migrations/20261105200000_sharing.sql?raw';
import syncMigration from '../../supabase/migrations/20261105120000_sync.sql?raw';

/**
 * What the migrations expect from Supabase: its roles, `auth.users`, `auth.uid()` and the (empty)
 * publication Realtime reads.
 */
const SUPABASE_STANDINS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  grant usage on schema public to anon, authenticated, service_role;
  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb not null default '{}');
  create function auth.uid() returns uuid language sql stable as $$
    select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
  $$;
  create publication supabase_realtime;
`;

const ROW_COLUMNS = `id, trip_id, kind, data, format, to_json(updated_at) #>> '{}' as updated_at,
  deleted, seq::float8 as seq`;

export interface SyncDatabase {
  db: PGlite;
  /** An account; `meta` is what its login filled in (`full_name`, `avatar_url`, ...). */
  addUser: (id: string, meta?: Record<string, unknown>) => Promise<void>;
  /**
   * Runs `work` as a request of the signed-in `userId` would (role `authenticated`, its JWT),
   * or of a visitor without a session when null (role `anon`).
   */
  as: <T>(userId: string | null, work: (tx: Transaction) => Promise<T>) => Promise<T>;
  /** The server as `userId`'s devices reach it (like `supabaseSyncServer`). */
  serverFor: (userId: string) => SyncServer;
  /** The sharing calls as `userId` makes them, or a visitor without a session (null). */
  sharingFor: (userId: string | null) => SharingServer;
  /** Empty again: no accounts, no records. */
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

/** A Postgres (PGlite) with the server side of sync and sharing, as the Supabase project has it. */
export async function createSyncDatabase(): Promise<SyncDatabase> {
  const db = await PGlite.create();
  await db.exec(SUPABASE_STANDINS);
  await db.exec(syncMigration);
  await db.exec(sharingMigration);

  const as: SyncDatabase['as'] = (userId, work) =>
    db.transaction(async (tx) => {
      await tx.exec(`set local role ${userId ? 'authenticated' : 'anon'}`);
      const claims = userId ? JSON.stringify({ sub: userId, role: 'authenticated' }) : '';
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
      return work(tx);
    });

  return {
    db,
    async addUser(id, meta = {}) {
      await db.query('insert into auth.users (id, raw_user_meta_data) values ($1, $2)', [id, meta]);
    },
    as,
    serverFor: (userId) => ({
      push: (changes) =>
        as(userId, async (tx) => {
          const { rows } = await tx.query<{ result: PushResult[] }>(
            'select public.sync_push($1::jsonb) as result',
            [JSON.stringify(changes)],
          );
          return rows[0]!.result;
        }),
      // Timestamps as PostgREST writes them in JSON (`2026-11-05T01:00:00+00:00`).
      pull: (after, limit) =>
        as(userId, async (tx) => {
          const { rows } = await tx.query<ServerRow>(
            `select ${ROW_COLUMNS} from public.records where seq > $1 order by seq limit $2`,
            [after, limit],
          );
          return rows;
        }),
      pullTrip: (tripId, after, limit) =>
        as(userId, async (tx) => {
          const { rows } = await tx.query<ServerRow>(
            `select ${ROW_COLUMNS} from public.records
             where trip_id = $1 and seq > $2 order by seq limit $3`,
            [tripId, after, limit],
          );
          return rows;
        }),
      memberships: () =>
        as(userId, async (tx) => {
          const { rows } = await tx.query<{ tripId: string; role: TripRole }>(
            'select trip_id as "tripId", role from public.trip_members',
          );
          return rows;
        }),
    }),
    sharingFor: (userId) =>
      createSharingServer((fn, args) =>
        as(userId, async (tx) => {
          // Named arguments, as PostgREST passes them.
          const names = Object.keys(args).map((name, i) => `${name} => $${i + 1}`);
          const { rows } = await tx.query<{ result: unknown }>(
            `select public.${fn}(${names.join(', ')}) as result`,
            Object.values(args),
          );
          return rows[0]!.result;
        }),
      ),
    async reset() {
      await db.exec(
        'truncate public.records, public.trip_members, public.invites; delete from auth.users;',
      );
    },
    close: () => db.close(),
  };
}
