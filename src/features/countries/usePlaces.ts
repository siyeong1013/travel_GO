import { useEffect, useState } from 'react';

/** Places people go by the code of the region (or country) they are in, as in places.ts. */
export type Places = Readonly<Record<string, readonly string[]>>;

const NONE: Places = {};
let loaded: Places | undefined;
let loading: Promise<Places> | undefined;

/** The places: places.ts is a chunk of its own, so only screens that search load it. */
export function loadPlaces(): Promise<Places> {
  if (!loading) {
    loading = import('@/features/countries/places').then(({ PLACES }) => (loaded = PLACES));
    loading.catch(() => (loading = undefined));
  }
  return loading;
}

/** The places once they have come; none till then, or if they don't. */
export function usePlaces(): Places {
  const [places, setPlaces] = useState(() => loaded ?? NONE);
  useEffect(() => {
    let current = true;
    loadPlaces().then(
      (found) => {
        if (current) setPlaces(found);
      },
      (error: unknown) => console.error(error),
    );
    return () => {
      current = false;
    };
  }, []);
  return places;
}
