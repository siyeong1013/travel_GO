/**
 * Google Maps JavaScript API key from `.env.local` (`VITE_GOOGLE_MAPS_API_KEY`), '' when unset.
 * Without it place search and the map show a notice, and the rest of the app works as usual.
 */
export function googleMapsApiKey(): string {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? '';
}

type ImportLibrary = (name: string) => Promise<unknown>;

interface MapsNamespace {
  importLibrary?: ImportLibrary;
  /** Called by the API's script once it has loaded (the `callback` parameter). */
  __ib__?: () => void;
}

/** The page's `google.maps`, created empty when the API has not been loaded yet. */
function mapsNamespace(): MapsNamespace {
  const root = globalThis as { google?: { maps?: object } };
  root.google ??= {};
  return (root.google.maps ??= {}) as MapsNamespace;
}

/**
 * Loads one library of the Maps JavaScript API. Nothing is downloaded until the first call, which
 * adds the API's script (Google's "dynamic library import" loader); later calls share it, and a
 * failed load (e.g. offline) is tried again on the next call. An existing
 * `google.maps.importLibrary` (the API loaded some other way, or a test stub) is used as is.
 */
export function importMapsLibrary<K extends keyof google.maps.ImportLibraryMap>(
  name: K,
): Promise<google.maps.ImportLibraryMap[K]> {
  const maps = mapsNamespace();
  maps.importLibrary ??= bootstrapLoader(maps);
  return maps.importLibrary(name) as Promise<google.maps.ImportLibraryMap[K]>;
}

/** Stand-in `importLibrary` that loads the API, which then replaces it with the real one. */
function bootstrapLoader(maps: MapsNamespace): ImportLibrary {
  const libraries = new Set<string>();
  let loading: Promise<void> | null = null;

  function load() {
    loading ??= new Promise<void>((resolve, reject) => {
      const params = new URLSearchParams({
        key: googleMapsApiKey(),
        v: 'weekly',
        language: 'ko',
        libraries: [...libraries].join(','),
        callback: 'google.maps.__ib__',
      });
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
      script.onerror = () => {
        loading = null;
        script.remove();
        reject(new Error('The Google Maps JavaScript API could not load.'));
      };
      maps.__ib__ = resolve;
      document.head.append(script);
    });
    return loading;
  }

  const importLibrary: ImportLibrary = async (name) => {
    libraries.add(name);
    await load();
    if (maps.importLibrary === importLibrary) {
      throw new Error('The Google Maps JavaScript API did not start.');
    }
    return maps.importLibrary!(name);
  };
  return importLibrary;
}
