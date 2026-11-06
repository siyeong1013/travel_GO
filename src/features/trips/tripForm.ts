import type { CoverPhoto, Trip, TripCity } from '@/data/models';
import type { NewTrip, TripPatch } from '@/data/repositories';
import { isCountryCode } from '@/data/rules/country';
import { MAX_TRIP_COUNTRIES } from '@/data/rules/validation';
import { type FlightDraft, foundLegs } from '@/features/schedule/flightDrafts';
import { isLocalDate } from '@/lib/dates';

export interface TripFormValues {
  title: string;
  /** In the order picked. */
  countries: string[];
  /** In the order added. */
  cities: TripCity[];
  /** Text in the city box: one more city when the form is sent (as typed). */
  cityText: string;
  startDate: string;
  endDate: string;
  /** The saved photo, a newly picked one, or none. */
  cover: CoverPhoto | null;
  /** New trips only. */
  flights: FlightDraft[];
}

export type TripFormField = 'title' | 'cities' | 'dates';
export type TripFormErrors = Partial<Record<TripFormField, string>>;

/** Field order (their `name`s), used to focus the first invalid field. */
export const TRIP_FORM_FIELDS: readonly TripFormField[] = ['title', 'cities', 'dates'];

export const emptyTripForm: TripFormValues = {
  title: '',
  countries: [],
  cities: [],
  cityText: '',
  startDate: '',
  endDate: '',
  cover: null,
  flights: [],
};

export const TITLE_MAX_LENGTH = 40;

export function validateTripForm(values: TripFormValues): TripFormErrors {
  const errors: TripFormErrors = {};
  if (!values.title.trim()) errors.title = '여행 이름을 입력해 주세요.';
  if (formCities(values).length === 0) errors.cities = '도시를 넣어 주세요.';
  if (!isLocalDate(values.startDate) || !isLocalDate(values.endDate)) {
    errors.dates = '여행 기간을 골라 주세요.';
  }
  return errors;
}

/** A city typed by hand: no place to bias place search with. */
export function typedCity(name: string): TripCity {
  return { name, placeId: null, location: null, fetchedAt: null };
}

/** The list with one more city, unless it has it (the same place, or a name typed that is there). */
export function withCity(cities: TripCity[], city: TripCity): TripCity[] {
  const has = cities.some((other) =>
    city.placeId !== null ? other.placeId === city.placeId : other.name === city.name,
  );
  return has ? cities : [...cities, city];
}

/** The cities as saved: those added, and what is still typed in the box. */
export function formCities(values: Pick<TripFormValues, 'cities' | 'cityText'>): TripCity[] {
  const typed = values.cityText.trim();
  return typed ? withCity(values.cities, typedCity(typed)) : values.cities;
}

export function toFormValues(trip: Trip): TripFormValues {
  return {
    title: trip.title,
    countries: trip.countries,
    cities: trip.cities,
    cityText: '',
    startDate: trip.startDate,
    endDate: trip.endDate,
    cover: trip.cover,
    flights: [],
  };
}

/**
 * Only the fields that changed (empty when nothing did). Call only with values that passed
 * `validateTripForm`.
 */
export function toTripPatch(values: TripFormValues, trip: Trip): TripPatch {
  const next = toNewTrip(values);
  const patch: TripPatch = {};
  if (next.title !== trip.title) patch.title = next.title;
  if (!sameCountries(values.countries, trip.countries)) patch.countries = values.countries;
  if (!sameCities(next.cities, trip.cities)) patch.cities = next.cities;
  if (next.startDate !== trip.startDate) patch.startDate = next.startDate;
  if (next.endDate !== trip.endDate) patch.endDate = next.endDate;
  if (!sameCover(values.cover, trip.cover)) patch.cover = values.cover;
  return patch;
}

/** Call only with values that passed `validateTripForm`. */
export function toNewTrip(values: TripFormValues): NewTrip {
  return {
    title: values.title.trim(),
    countries: values.countries,
    cities: formCities(values),
    startDate: values.startDate,
    endDate: values.endDate,
    cover: values.cover,
  };
}

/**
 * The countries with those that `found` (a row of `flights`, just looked up) lands in: each arrival
 * but home, where the first flight found leaves from (the flight back lands there). Picked ones
 * stay, in their order.
 */
export function withFlightCountries(
  countries: string[],
  flights: FlightDraft[],
  found: FlightDraft,
): string[] {
  const first = flights.map(foundLegs).find((legs) => legs.length > 0) ?? foundLegs(found);
  const home = first[0]?.departure.countryCode ?? null;
  const next = [...countries];
  for (const { arrival } of foundLegs(found)) {
    const code = arrival.countryCode;
    if (isCountryCode(code) && code !== home && !next.includes(code)) next.push(code);
  }
  return next.slice(0, Math.max(MAX_TRIP_COUNTRIES, countries.length));
}

const sameCountries = (a: string[], b: string[]) =>
  a.length === b.length && a.every((code, i) => code === b[i]);

const sameCities = (a: TripCity[], b: TripCity[]) =>
  a.length === b.length && a.every((city, i) => sameCity(city, b[i]!));

function sameCity(a: TripCity, b: TripCity): boolean {
  return (
    a.name === b.name &&
    a.placeId === b.placeId &&
    a.location?.lat === b.location?.lat &&
    a.location?.lng === b.location?.lng &&
    a.fetchedAt === b.fetchedAt
  );
}

const sameCover = (a: CoverPhoto | null, b: CoverPhoto | null) =>
  a?.image === b?.image && a?.thumbnail === b?.thumbnail;
