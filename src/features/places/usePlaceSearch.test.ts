/** @vitest-environment happy-dom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { refines, SEARCH_DELAY_MS, usePlaceSearch } from '@/features/places/usePlaceSearch';

/** Places API whose answers the test hands out, in any order. */
function stubSlowPlacesApi() {
  const pending: { input: string; answer: (names: string[]) => void }[] = [];
  const prediction = (name: string) => ({
    placeId: name,
    text: { text: name },
    mainText: { text: name },
    secondaryText: null,
  });
  const library = {
    AutocompleteSessionToken: class {},
    AutocompleteSuggestion: {
      fetchAutocompleteSuggestions: ({ input }: google.maps.places.AutocompleteRequest) =>
        new Promise((resolve) => {
          pending.push({
            input,
            answer: (names) =>
              resolve({ suggestions: names.map((name) => ({ placePrediction: prediction(name) })) }),
          });
        }),
    },
  };
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
  vi.stubGlobal('google', { maps: { importLibrary: async () => library } });
  return pending;
}

const names = (state: ReturnType<typeof usePlaceSearch>) => state.suggestions.map((s) => s.name);

describe('usePlaceSearch', () => {
  it('shows only the latest search, and keeps its results while the text is refined', async () => {
    const pending = stubSlowPlacesApi();
    const { result, rerender } = renderHook(
      ({ text }) => usePlaceSearch(text, { kind: 'place', bias: null }),
      { initialProps: { text: '오사' } },
    );
    await waitFor(() => expect(pending).toHaveLength(1));
    rerender({ text: '오사카' });
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(result.current.status).toBe('searching');

    // The older search answers last: too late to count.
    await act(async () => pending[1]!.answer(['오사카성']));
    await act(async () => pending[0]!.answer(['오사카역']));
    expect(result.current.status).toBe('done');
    expect(names(result.current)).toEqual(['오사카성']);

    rerender({ text: '오사카성' });
    expect(result.current.status).toBe('searching');
    expect(names(result.current)).toEqual(['오사카성']);
    rerender({ text: '도톤보리' });
    expect(result.current.suggestions).toEqual([]);
  });

  it('does not search text shorter than two characters', async () => {
    const pending = stubSlowPlacesApi();
    const { result } = renderHook(() => usePlaceSearch(' 오 ', { kind: 'place', bias: null }));
    await act(() => new Promise((resolve) => setTimeout(resolve, SEARCH_DELAY_MS + 100)));
    expect(pending).toEqual([]);
    expect(result.current.status).toBe('idle');
  });
});

describe('refines', () => {
  it('keeps results while the text is extended or shortened', () => {
    expect(refines('오사', '오사카성')).toBe(true);
    expect(refines('오사카성', '오사카')).toBe(true);
  });

  it('keeps them while the last syllable is being composed', () => {
    expect(refines('오사카', '오사캇')).toBe(true);
    expect(refines('도톤보', '도톤볼')).toBe(true);
  });

  it('drops them for other text', () => {
    expect(refines('오사카성', '도톤보리')).toBe(false);
    expect(refines('교토역', '오사카역')).toBe(false);
  });
});
