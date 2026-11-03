import type {
  GeoPoint,
  ISODateTime,
  PlaceData,
  PlaceSnapshot,
  ScheduleItem,
  Trip,
} from '@/data/models';
import { type Clock, compareIsoDateTime, nowIso } from '@/lib/dates';
import { importMapsLibrary } from '@/lib/googleMaps';

/** `place`: anything (schedule items). `region`: cities, provinces, countries (a trip's city). */
export type PlaceKind = 'place' | 'region';

export interface PlaceSuggestion {
  placeId: string;
  /** The place's name. */
  name: string;
  /** The rest of the description, e.g. the city and country; '' when there is none. */
  detail: string;
}

export interface SuggestOptions {
  kind: PlaceKind;
  /** Results around here come first (`searchBias`). */
  bias: GeoPoint | null;
}

/** One search, from the first query to the picked place: one Places session token. */
export interface PlaceSearchSession {
  /** Google's suggestions for `input` (up to 5). */
  suggest(input: string, options: SuggestOptions): Promise<PlaceSuggestion[]>;
  /** Fetches the address and location of a suggestion from this session, ending the session. */
  pick(suggestion: PlaceSuggestion): Promise<PlaceSnapshot>;
}

export interface PlaceSearch {
  startSession(): PlaceSearchSession;
}

/** Bias circle around the trip's city: the city and its suburbs first, farther places still show. */
export const BIAS_RADIUS_METERS = 30_000;

/**
 * Place Details fields fetched for a pick or a refresh. Essentials only: the name comes from the
 * suggestion, since `displayName` (Pro) would bill a session's closing call at the top SKU.
 */
export const PICK_FIELDS = ['formattedAddress', 'location'];

type LoadPlaces = () => Promise<google.maps.PlacesLibrary>;
const loadPlacesLibrary: LoadPlaces = () => importMapsLibrary('places');

/** Places API (New): `AutocompleteSuggestion` for suggestions, `Place.fetchFields` for a pick. */
export function createPlaceSearch(
  loadPlaces: LoadPlaces = loadPlacesLibrary,
  now: Clock = nowIso,
): PlaceSearch {
  return {
    startSession() {
      let token: google.maps.places.AutocompleteSessionToken | null = null;
      const predictions = new Map<string, google.maps.places.PlacePrediction>();

      return {
        async suggest(input, { kind, bias }) {
          const places = await loadPlaces();
          token ??= new places.AutocompleteSessionToken();
          const request: google.maps.places.AutocompleteRequest = {
            input,
            sessionToken: token,
            language: 'ko',
          };
          if (bias) request.locationBias = { center: bias, radius: BIAS_RADIUS_METERS };
          if (kind === 'region') request.includedPrimaryTypes = ['(regions)'];

          const { suggestions } =
            await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
          return suggestions.flatMap(({ placePrediction: prediction }) => {
            if (!prediction) return [];
            predictions.set(prediction.placeId, prediction);
            return [toSuggestion(prediction)];
          });
        },

        async pick(suggestion) {
          const prediction = predictions.get(suggestion.placeId);
          if (!prediction) throw new Error(`not a suggestion of this session: ${suggestion.placeId}`);
          // A place from `toPlace()` carries the session token: this call ends the session.
          const { place } = await prediction.toPlace().fetchFields({ fields: PICK_FIELDS });
          return { name: suggestion.name, ...toPlaceData(suggestion.placeId, place, now()) };
        },
      };
    },
  };
}

export const placeSearch = createPlaceSearch();

export function toSuggestion(prediction: google.maps.places.PlacePrediction): PlaceSuggestion {
  return {
    placeId: prediction.placeId,
    name: prediction.mainText?.text || prediction.text.text,
    detail: prediction.secondaryText?.text ?? '',
  };
}

function toPlaceData(
  placeId: string,
  place: google.maps.places.Place,
  fetchedAt: ISODateTime,
): PlaceData {
  const { formattedAddress, location } = place;
  return {
    placeId,
    address: formattedAddress || null,
    location: location ? { lat: location.lat(), lng: location.lng() } : null,
    fetchedAt,
  };
}

/**
 * Fetches Google's current address and location of a place, outside any search session (a
 * Place Details Essentials call), to refresh data that is getting old.
 */
export function createPlaceDataFetcher(loadPlaces: LoadPlaces = loadPlacesLibrary, now: Clock = nowIso) {
  return async (placeId: string): Promise<PlaceData> => {
    const places = await loadPlaces();
    const place = new places.Place({ id: placeId, requestedLanguage: 'ko' });
    await place.fetchFields({ fields: PICK_FIELDS });
    return toPlaceData(placeId, place, now());
  };
}

export const fetchPlaceData = createPlaceDataFetcher();

/** Where search looks first: the trip's city, else the place with a location added last. */
export function searchBias(trip: Trip, items: ScheduleItem[]): GeoPoint | null {
  if (trip.city.location) return trip.city.location;
  let latest: ScheduleItem | undefined;
  for (const item of items) {
    if (!item.place.location) continue;
    if (!latest || compareIsoDateTime(item.createdAt, latest.createdAt) > 0) latest = item;
  }
  return latest?.place.location ?? null;
}
