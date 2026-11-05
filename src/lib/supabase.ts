import type { SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseConfig {
  url: string;
  /** The publishable key (`sb_publishable_…`): public by design, the server's rules guard the data. */
  key: string;
}

/**
 * The Supabase project from `.env.local` / Vercel (`VITE_SUPABASE_URL`,
 * `VITE_SUPABASE_PUBLISHABLE_KEY`); null when either is unset, and then the app has no login.
 */
export function supabaseConfig(): SupabaseConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';
  return url && key ? { url, key } : null;
}

let client: Promise<SupabaseClient> | null = null;

/**
 * The app's Supabase client; its code loads on first use, not with the app. Logins use PKCE: the
 * provider sends the page back with `?code=`, which the client trades for a session as it starts
 * (then takes off the address).
 */
export function supabase(config: SupabaseConfig): Promise<SupabaseClient> {
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(config.url, config.key, { auth: { flowType: 'pkce' } }),
  );
  return client;
}
