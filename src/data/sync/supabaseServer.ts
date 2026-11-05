import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { VisitedCountry } from '@/data/models';
import { createSharingServer, type SharingServer, type TripRole } from '@/data/sharing/sharing';
import type { PushResult, ServerRow } from '@/data/sync/records';
import type { SyncServer } from '@/data/sync/syncEngine';

/** A request that hangs (a bad connection) gives up after this long. */
const TIMEOUT_MS = 30_000;

const ROW_COLUMNS = 'id, trip_id, kind, data, format, updated_at, deleted, seq';

/** The server answered with an error (or didn't answer in time). */
export class SyncServerError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'SyncServerError';
    this.code = code;
  }
}

function timeout(): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(TIMEOUT_MS);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), TIMEOUT_MS);
  return controller.signal;
}

/** A row of `visited_countries` as the server sends it. */
export interface CountryRow {
  code: string;
  visited: boolean;
  /** As PostgREST writes it: `2026-11-05T01:00:00.123+00:00`. */
  updated_at: string;
}

/** The server's rows as the app keeps countries (`updatedAt` written like the app writes it). */
export function toCountries(rows: CountryRow[]): VisitedCountry[] {
  return rows.map((row) => ({
    id: row.code,
    visited: row.visited,
    updatedAt: new Date(row.updated_at).toISOString(),
  }));
}

/** Countries as `save_visited_countries` takes them. */
export function countryChanges(countries: VisitedCountry[]) {
  return countries.map(({ id, visited, updatedAt }) => ({ code: id, visited, updatedAt }));
}

/** Sync with the app's Supabase project (supabase/migrations), as its client's signed-in account. */
export function supabaseSyncServer(client: SupabaseClient): SyncServer {
  return {
    async push(changes) {
      const { data, error } = await client.rpc('sync_push', { changes }).abortSignal(timeout());
      if (error) throw new SyncServerError(error.message, error.code);
      return data as PushResult[];
    },

    async pull(after, limit) {
      const { data, error } = await client
        .from('records')
        .select(ROW_COLUMNS)
        .gt('seq', after)
        .order('seq')
        .limit(limit)
        .abortSignal(timeout());
      if (error) throw new SyncServerError(error.message, error.code);
      return data as ServerRow[];
    },

    async pullTrip(tripId, after, limit) {
      const { data, error } = await client
        .from('records')
        .select(ROW_COLUMNS)
        .eq('trip_id', tripId)
        .gt('seq', after)
        .order('seq')
        .limit(limit)
        .abortSignal(timeout());
      if (error) throw new SyncServerError(error.message, error.code);
      return data as ServerRow[];
    },

    async memberships() {
      // Only the account's own rows are readable.
      const { data, error } = await client
        .from('trip_members')
        .select('trip_id, role')
        .abortSignal(timeout());
      if (error) throw new SyncServerError(error.message, error.code);
      return (data as { trip_id: string; role: TripRole }[]).map((row) => ({
        tripId: row.trip_id,
        role: row.role,
      }));
    },

    async countries() {
      // Only the account's own rows are readable.
      const { data, error } = await client
        .from('visited_countries')
        .select('code, visited, updated_at')
        .abortSignal(timeout());
      if (error) throw new SyncServerError(error.message, error.code);
      return toCountries(data as CountryRow[]);
    },

    async saveCountries(countries) {
      const { error } = await client
        .rpc('save_visited_countries', { changes: countryChanges(countries) })
        .abortSignal(timeout());
      if (error) throw new SyncServerError(error.message, error.code);
    },
  };
}

/** After the server closes the channel (it doesn't come back by itself), listen again this soon. */
const RELISTEN_MS = 5000;

/**
 * Calls `onChange` when a record the signed-in account may read is written, by anyone (its own
 * other devices too): Realtime's Postgres Changes, which hold each change to the records' read
 * policy. A deleted record is an update, and a deleted trip's records go with its own update.
 * Changes made while not connected are lost, so a rejoin counts as one. Resolves to the stop.
 */
export async function supabaseWatch(
  client: SupabaseClient,
  onChange: () => void,
): Promise<() => void> {
  let stopped = false;
  let channel: RealtimeChannel | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Only small columns: a record with a photo is over Realtime's 1 MB per message.
  const select = ['trip_id', 'seq'];

  async function listen() {
    // Joins as the signed-in account (its token), not the publishable key.
    await client.realtime.setAuth();
    if (stopped) return;
    let joined = false;
    channel = client
      .channel('travel-go:records')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'records', select }, onChange)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'records', select }, onChange)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (joined) onChange();
          joined = true;
        } else if (status === 'CLOSED' && !stopped) {
          timer = setTimeout(() => void listen(), RELISTEN_MS);
        }
      });
  }

  await listen();
  return () => {
    stopped = true;
    clearTimeout(timer);
    if (channel) void client.removeChannel(channel);
  };
}

/** The sharing calls (supabase/migrations/*_sharing.sql) as the client's account, or a visitor. */
export function supabaseSharingServer(client: SupabaseClient): SharingServer {
  return createSharingServer(async (fn, args) => {
    const { data, error } = await client.rpc(fn, args).abortSignal(timeout());
    if (error) throw new SyncServerError(error.message, error.code);
    return data;
  });
}
