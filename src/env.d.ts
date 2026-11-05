interface ImportMetaEnv {
  /** Google Maps JavaScript API key (`.env.local`). Without it there is no place search or map. */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  /** Map ID for Advanced Markers (`.env.local`, optional). */
  readonly VITE_GOOGLE_MAPS_MAP_ID?: string;
  /** Supabase project URL (`.env.local`). Without it (or the key) there is no login. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase publishable key (`sb_publishable_…`, public by design). */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}
