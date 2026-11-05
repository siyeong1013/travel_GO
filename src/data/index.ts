import { createDataLayer } from '@/data/dataLayer';
import { createTravelGoDB } from '@/data/local';
import { supabaseSyncServer } from '@/data/sync/supabaseServer';
import { supabase, supabaseConfig } from '@/lib/supabase';

/**
 * The only place that picks the storage implementation: the device's database, synced with the
 * account's copy on Supabase while signed in (data/sync).
 */
export const { repositories, syncEngine, onLocalWrite } = createDataLayer(
  createTravelGoDB(),
  async () => {
    const config = supabaseConfig();
    if (!config) throw new Error('this build has no Supabase project');
    return supabaseSyncServer(await supabase(config));
  },
);
