// A stand-in for the Places API (New) library, for place search tests (`stubPlacesApi` in
// test/app.tsx puts it on the page; unit tests hand `library` to `createPlaceSearch`).
import type { GeoPoint } from '@/data/models';

/** A place the fake API knows. */
export interface FakePlace {
  placeId: string;
  name: string;
  /** Secondary text of its suggestion, e.g. the city and country. */
  detail: string;
  address: string;
  location: GeoPoint;
  /** Found by region searches (cities, provinces, countries). */
  region?: boolean;
}

export const OSAKA_CASTLE: FakePlace = {
  placeId: 'place-osaka-castle',
  name: '오사카성',
  detail: '일본 오사카부 오사카시 주오구',
  address: '일본 〒540-0002 오사카부 오사카시 주오구 오사카조 1-1',
  location: { lat: 34.6873153, lng: 135.5262013 },
};

export const DOTONBORI: FakePlace = {
  placeId: 'place-dotonbori',
  name: '도톤보리',
  detail: '일본 오사카부 오사카시 주오구',
  address: '일본 〒542-0071 오사카부 오사카시 주오구 도톤보리',
  location: { lat: 34.6686, lng: 135.5011 },
};

export const OSAKA: FakePlace = {
  placeId: 'place-osaka',
  name: '오사카',
  detail: '일본 오사카부',
  address: '일본 오사카부 오사카시',
  location: { lat: 34.6937378, lng: 135.5021651 },
  region: true,
};

export interface FakePlacesOptions {
  /** Every autocomplete request fails (e.g. a rejected key). */
  failSearch?: boolean;
  /** Every Place Details call fails. */
  failPick?: boolean;
}

export interface FakePlacesApi {
  library: google.maps.PlacesLibrary;
  /** Every autocomplete request, in order. */
  requests: google.maps.places.AutocompleteRequest[];
  /** Every Place Details call, in order. */
  fetched: { placeId: string; fields: string[] }[];
}

/**
 * Suggests the places whose name contains the input (only regions for a `(regions)` request), and
 * fills in the address and location on `fetchFields`.
 */
export function fakePlacesApi(
  places: FakePlace[],
  { failSearch = false, failPick = false }: FakePlacesOptions = {},
): FakePlacesApi {
  const requests: FakePlacesApi['requests'] = [];
  const fetched: FakePlacesApi['fetched'] = [];

  function prediction(known: FakePlace) {
    return {
      placeId: known.placeId,
      text: { text: `${known.name}, ${known.detail}` },
      mainText: { text: known.name },
      secondaryText: { text: known.detail },
      types: [],
      toPlace() {
        const place = {
          id: known.placeId,
          formattedAddress: undefined as string | undefined,
          location: undefined as { lat: () => number; lng: () => number } | undefined,
          async fetchFields({ fields }: google.maps.places.FetchFieldsRequest) {
            fetched.push({ placeId: known.placeId, fields: [...fields] });
            if (failPick) throw new Error('fake Place Details failure');
            place.formattedAddress = known.address;
            place.location = { lat: () => known.location.lat, lng: () => known.location.lng };
            return { place };
          },
        };
        return place;
      },
    };
  }

  const library = {
    AutocompleteSessionToken: class AutocompleteSessionToken {},
    AutocompleteSuggestion: {
      async fetchAutocompleteSuggestions(request: google.maps.places.AutocompleteRequest) {
        requests.push(request);
        if (failSearch) throw new Error('fake autocomplete failure');
        const regionsOnly = request.includedPrimaryTypes?.includes('(regions)') ?? false;
        const found = places.filter(
          (place) => place.name.includes(request.input) && (!regionsOnly || place.region),
        );
        return { suggestions: found.map((place) => ({ placePrediction: prediction(place) })) };
      },
    },
  };

  return { library: library as unknown as google.maps.PlacesLibrary, requests, fetched };
}
