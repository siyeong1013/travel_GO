import { describe, expect, it } from 'vitest';
import {
  BIAS_RADIUS_METERS,
  createPlaceDataFetcher,
  createPlaceSearch,
  searchBias,
  toSuggestion,
} from '@/features/places/placeSearch';
import { makeItem, makePlace, makeTrip, T0 } from '@/test/fixtures';
import { DOTONBORI, fakePlacesApi, OSAKA, OSAKA_CASTLE } from '@/test/places';

function setup() {
  const api = fakePlacesApi([OSAKA_CASTLE, DOTONBORI, OSAKA]);
  return { api, search: createPlaceSearch(async () => api.library, () => T0) };
}

describe('placeSearch', () => {
  it('suggests places in Korean, around the bias point when there is one', async () => {
    const { api, search } = setup();
    const session = search.startSession();
    const bias = { lat: 34.69, lng: 135.5 };

    expect(await session.suggest('오사카', { kind: 'place', bias })).toEqual([
      { placeId: OSAKA_CASTLE.placeId, name: '오사카성', detail: OSAKA_CASTLE.detail },
      { placeId: OSAKA.placeId, name: '오사카', detail: OSAKA.detail },
    ]);
    expect(api.requests[0]).toEqual({
      input: '오사카',
      sessionToken: expect.any(api.library.AutocompleteSessionToken),
      language: 'ko',
      locationBias: { center: bias, radius: BIAS_RADIUS_METERS },
    });

    await session.suggest('도톤', { kind: 'place', bias: null });
    expect(api.requests[1]).not.toHaveProperty('locationBias');
  });

  it('only suggests regions for a city', async () => {
    const { api, search } = setup();
    const found = await search.startSession().suggest('오사카', { kind: 'region', bias: null });
    expect(found.map((s) => s.name)).toEqual(['오사카']);
    expect(api.requests[0]!.includedPrimaryTypes).toEqual(['(regions)']);
  });

  it('keeps one session token until a pick, which fetches Essentials fields only', async () => {
    const { api, search } = setup();
    const session = search.startSession();
    await session.suggest('오사', { kind: 'place', bias: null });
    const [castle] = await session.suggest('오사카성', { kind: 'place', bias: null });
    expect(api.requests[1]!.sessionToken).toBe(api.requests[0]!.sessionToken);

    expect(await session.pick(castle!)).toEqual({
      placeId: OSAKA_CASTLE.placeId,
      name: '오사카성',
      address: OSAKA_CASTLE.address,
      location: OSAKA_CASTLE.location,
      fetchedAt: T0,
    });
    // No displayName: it would bill the whole session at the top Place Details SKU.
    expect(api.fetched).toEqual([
      { placeId: OSAKA_CASTLE.placeId, fields: ['formattedAddress', 'location'] },
    ]);

    await search.startSession().suggest('도톤보리', { kind: 'place', bias: null });
    expect(api.requests[2]!.sessionToken).not.toBe(api.requests[0]!.sessionToken);
  });

  it('only picks suggestions of its own session', async () => {
    const { search } = setup();
    const [castle] = await search.startSession().suggest('오사카성', { kind: 'place', bias: null });
    await expect(search.startSession().pick(castle!)).rejects.toThrow('not a suggestion');
  });

  it('skips suggestions that are not places, and reads names from the full text if needed', async () => {
    const prediction = {
      placeId: 'p1',
      text: { text: '난바역, 일본 오사카부' },
      mainText: null,
      secondaryText: null,
    } as unknown as google.maps.places.PlacePrediction;
    expect(toSuggestion(prediction)).toEqual({ placeId: 'p1', name: '난바역, 일본 오사카부', detail: '' });

    const library = {
      AutocompleteSessionToken: class {},
      AutocompleteSuggestion: {
        fetchAutocompleteSuggestions: async () => ({
          suggestions: [{ placePrediction: null }, { placePrediction: prediction }],
        }),
      },
    } as unknown as google.maps.PlacesLibrary;
    const found = await createPlaceSearch(async () => library)
      .startSession()
      .suggest('난바', { kind: 'place', bias: null });
    expect(found.map((s) => s.placeId)).toEqual(['p1']);
  });
});

describe('createPlaceDataFetcher', () => {
  it('refreshes a place outside any search session, in Korean, with Essentials fields', async () => {
    const calls: { options: unknown; fields: string[] }[] = [];
    class Place {
      formattedAddress?: string;
      location?: { lat: () => number; lng: () => number };
      constructor(private options: unknown) {}
      async fetchFields({ fields }: { fields: Iterable<string> }) {
        calls.push({ options: this.options, fields: [...fields] });
        this.formattedAddress = OSAKA_CASTLE.address;
        this.location = { lat: () => 34.68, lng: () => 135.52 };
        return { place: this };
      }
    }
    const library = { Place } as unknown as google.maps.PlacesLibrary;

    const fetchPlaceData = createPlaceDataFetcher(async () => library, () => T0);
    expect(await fetchPlaceData(OSAKA_CASTLE.placeId)).toEqual({
      placeId: OSAKA_CASTLE.placeId,
      address: OSAKA_CASTLE.address,
      location: { lat: 34.68, lng: 135.52 },
      fetchedAt: T0,
    });
    expect(calls).toEqual([
      {
        options: { id: OSAKA_CASTLE.placeId, requestedLanguage: 'ko' },
        fields: ['formattedAddress', 'location'],
      },
    ]);
  });
});

describe('searchBias', () => {
  it("looks around the trip's city, else the place with a location added last", () => {
    const city = { name: '오사카', placeId: OSAKA.placeId, location: OSAKA.location, fetchedAt: T0 };
    const typedCity = makeTrip({ city: { name: '오사카', placeId: null, location: null, fetchedAt: null } });
    const items = [
      makeItem({ tripId: typedCity.id, place: makePlace('a', { location: { lat: 1, lng: 1 } }), createdAt: '2026-01-02T00:00:00.000Z' }),
      makeItem({ tripId: typedCity.id, place: makePlace('b', { location: { lat: 2, lng: 2 } }), createdAt: '2026-01-03T00:00:00.000Z' }),
      makeItem({ tripId: typedCity.id, place: makePlace('c', { placeId: null, location: null, fetchedAt: null }), createdAt: '2026-01-04T00:00:00.000Z' }),
    ];

    expect(searchBias(makeTrip({ city }), items)).toEqual(OSAKA.location);
    expect(searchBias(typedCity, items)).toEqual({ lat: 2, lng: 2 });
    expect(searchBias(typedCity, [items[2]!])).toBeNull();
  });
});
