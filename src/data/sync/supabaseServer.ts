import type { SupabaseClient } from '@supabase/supabase-js';
import type { PushResult, ServerRow } from '@/data/sync/records';
import type { SyncServer } from '@/data/sync/syncEngine';

/** A request that hangs (a bad connection) gives up after this long. */
const TIMEOUT_MS = 30_000;

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
        .select('id, trip_id, kind, data, format, updated_at, deleted, seq')
        .gt('seq', after)
        .order('seq')
        .limit(limit)
        .abortSignal(timeout());
      if (error) throw new SyncServerError(error.message, error.code);
      return data as ServerRow[];
    },
  };
}
