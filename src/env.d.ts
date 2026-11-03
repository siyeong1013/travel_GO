interface ImportMetaEnv {
  /** Google Maps JavaScript API key (`.env.local`). Without it there is no place search or map. */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  /** Map ID for Advanced Markers (`.env.local`, optional). */
  readonly VITE_GOOGLE_MAPS_MAP_ID?: string;
}
