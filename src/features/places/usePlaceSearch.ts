import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { PlaceSnapshot } from '@/data/models';
import {
  type PlaceSearchSession,
  type PlaceSuggestion,
  placeSearch,
  type SuggestOptions,
} from '@/features/places/placeSearch';
import { googleMapsApiKey } from '@/lib/googleMaps';
import { useOnline } from '@/lib/useOnline';

/** `no_key` / `offline`: no search, but places can still be added by name. */
export type SearchAvailability = 'ready' | 'no_key' | 'offline';

export function useSearchAvailability(): SearchAvailability {
  const online = useOnline();
  if (!googleMapsApiKey()) return 'no_key';
  return online ? 'ready' : 'offline';
}

/** Shorter text is not searched (a lone syllable, or a jamo while typing Korean). */
export const MIN_QUERY_LENGTH = 2;
/** Searches after a pause in typing, so a word costs a request or two instead of one per key. */
export const SEARCH_DELAY_MS = 300;

/** `idle`: no search (unavailable, or the text is too short). */
export type SearchStatus = 'idle' | 'searching' | 'done' | 'failed';

export interface PlaceSearchState {
  availability: SearchAvailability;
  status: SearchStatus;
  /** What to show: the latest results, kept while a search for refined text runs. */
  suggestions: PlaceSuggestion[];
  /** Address and location of a shown suggestion. The next search starts a new session. */
  pick: (suggestion: PlaceSuggestion) => Promise<PlaceSnapshot>;
  /** Searches the same text again after a failure. */
  retry: () => void;
}

interface Results {
  input: string;
  suggestions: PlaceSuggestion[];
  session: PlaceSearchSession;
}

/** Google's suggestions for `text` as it is typed: debounced, and only the latest search counts. */
export function usePlaceSearch(text: string, options: SuggestOptions): PlaceSearchState {
  const availability = useSearchAvailability();
  const input = text.trim();
  const active = availability === 'ready' && input.length >= MIN_QUERY_LENGTH;
  const [results, setResults] = useState<Results | null>(null);
  const [failedInput, setFailedInput] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const session = useRef<PlaceSearchSession | null>(null);

  const search = useEffectEvent((query: string, isLatest: () => boolean) => {
    const current = (session.current ??= placeSearch.startSession());
    current.suggest(query, options).then(
      (suggestions) => {
        if (!isLatest()) return;
        setResults({ input: query, suggestions, session: current });
        setFailedInput(null);
      },
      (error: unknown) => {
        console.error(error);
        if (isLatest()) setFailedInput(query);
      },
    );
  });

  useEffect(() => {
    if (!active) return;
    let latest = true;
    const timer = setTimeout(() => search(input, () => latest), SEARCH_DELAY_MS);
    return () => {
      latest = false;
      clearTimeout(timer);
    };
  }, [active, input, attempt]);

  let status: SearchStatus = 'idle';
  if (active) {
    status = failedInput === input ? 'failed' : results?.input === input ? 'done' : 'searching';
  }
  const showResults =
    results !== null &&
    (status === 'done' || (status === 'searching' && refines(results.input, input)));

  return {
    availability,
    status,
    suggestions: showResults ? results.suggestions : [],
    async pick(suggestion) {
      if (!results) throw new Error('no suggestions to pick from');
      const owner = results.session;
      const place = await owner.pick(suggestion);
      if (session.current === owner) session.current = null;
      return place;
    },
    retry() {
      setFailedInput(null);
      setAttempt((n) => n + 1);
    },
  };
}

/**
 * Whether results for `previous` still fit while `next` is searched: one text extends the other,
 * give or take the last character (the syllable being composed on a Korean keyboard).
 */
export function refines(previous: string, next: string): boolean {
  let common = 0;
  while (common < previous.length && common < next.length && previous[common] === next[common]) {
    common += 1;
  }
  return common > 0 && common >= Math.min(previous.length, next.length) - 1;
}
