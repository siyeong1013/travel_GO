import { createDataLayer } from '@/data/dataLayer';
import { createTravelGoDB } from '@/data/local';
import type { SharingServer } from '@/data/sharing/sharing';
import {
  supabaseSharingServer,
  supabaseSyncServer,
  supabaseWatch,
} from '@/data/sync/supabaseServer';
import { supabase, supabaseConfig } from '@/lib/supabase';

async function client() {
  const config = supabaseConfig();
  if (!config) throw new Error('this build has no Supabase project');
  return supabase(config);
}

/**
 * The only place that picks the storage implementation: the device's database, synced with the
 * account's copy on Supabase while signed in (data/sync).
 */
export const { repositories, syncEngine, onLocalWrite } = createDataLayer(
  createTravelGoDB(),
  async () => supabaseSyncServer(await client()),
);

/** Sharing a trip (data/sharing) as the signed-in account `userId`, or a visitor (null). */
export const connectSharing: (userId: string | null) => Promise<SharingServer> = async () =>
  supabaseSharingServer(await client());

/** Hears of writes to the trips the signed-in account may read, as they happen. Resolves to the stop. */
export const watchServer = async (onChange: () => void): Promise<() => void> =>
  supabaseWatch(await client(), onChange);
