import { describe, expect, it } from 'vitest';
import type { FlightDraft } from '@/features/schedule/flightDrafts';
import {
  emptyTripForm,
  formCities,
  toFormValues,
  toNewTrip,
  toTripPatch,
  type TripFormValues,
  validateTripForm,
  withCity,
  withFlightCountries,
} from '@/features/trips/tripForm';
import type { FlightLeg } from '@/lib/flights';
import { makeCover, makeTrip, T0, typedCity } from '@/test/fixtures';

const valid: TripFormValues = {
  ...emptyTripForm,
  title: '오사카 여행',
  cities: [typedCity('오사카')],
  startDate: '2026-11-10',
  endDate: '2026-11-12',
};

const OSAKA = {
  name: '오사카',
  placeId: 'osaka',
  location: { lat: 34.69, lng: 135.5 },
  fetchedAt: T0,
};

describe('validateTripForm', () => {
  it('requires a title, a city and the dates', () => {
    expect(Object.keys(validateTripForm(emptyTripForm))).toEqual(['title', 'cities', 'dates']);
    expect(validateTripForm({ ...valid, title: '   ' })).toHaveProperty('title');
    expect(validateTripForm(valid)).toEqual({});
  });

  it('takes a city still typed in the box', () => {
    expect(validateTripForm({ ...valid, cities: [], cityText: ' 교토 ' })).toEqual({});
    expect(validateTripForm({ ...valid, cities: [], cityText: ' ' })).toHaveProperty('cities');
  });
});

describe('cities', () => {
  it('are added once: the same place, or a name typed that is there', () => {
    expect(withCity([OSAKA], { ...OSAKA, name: '오사카시' })).toEqual([OSAKA]);
    expect(withCity([typedCity('교토')], typedCity('교토'))).toEqual([typedCity('교토')]);
    expect(withCity([OSAKA], typedCity('오사카'))).toEqual([OSAKA]);
    expect(withCity([OSAKA], typedCity('교토'))).toEqual([OSAKA, typedCity('교토')]);
  });

  it('take in what is still typed, as typed', () => {
    expect(formCities({ cities: [OSAKA], cityText: ' 교토 ' })).toEqual([OSAKA, typedCity('교토')]);
    expect(formCities({ cities: [OSAKA], cityText: '' })).toEqual([OSAKA]);
  });
});

describe('toNewTrip', () => {
  it('trims the title; keeps the countries and cities in their order', () => {
    const values = { ...valid, title: ' 간사이 여행 ', countries: ['JP'], cities: [OSAKA], cityText: '교토' };
    expect(toNewTrip(values)).toEqual({
      title: '간사이 여행',
      countries: ['JP'],
      cities: [OSAKA, typedCity('교토')],
      startDate: '2026-11-10',
      endDate: '2026-11-12',
      cover: null,
    });
    expect(toNewTrip({ ...valid, cover: makeCover() }).cover).toEqual(makeCover());
  });
});

describe('toTripPatch', () => {
  const trip = makeTrip({
    title: '오사카 여행',
    countries: ['JP'],
    cities: [OSAKA],
    startDate: '2026-11-10',
    endDate: '2026-11-12',
  });

  it('is empty when nothing changed', () => {
    expect(toTripPatch(toFormValues(trip), trip)).toEqual({});
  });

  it('has only the changed fields', () => {
    const values = toFormValues(trip);
    expect(toTripPatch({ ...values, title: ' 간사이 여행 ' }, trip)).toEqual({ title: '간사이 여행' });
    expect(toTripPatch({ ...values, endDate: '2026-11-11' }, trip)).toEqual({ endDate: '2026-11-11' });
    expect(toTripPatch({ ...values, countries: ['JP', 'KR'] }, trip)).toEqual({ countries: ['JP', 'KR'] });
    expect(toTripPatch({ ...values, cityText: '교토' }, trip)).toEqual({
      cities: [OSAKA, typedCity('교토')],
    });
    expect(toTripPatch({ ...values, cities: [], cityText: '교토' }, trip)).toEqual({
      cities: [typedCity('교토')],
    });
  });

  it('saves a new cover photo, or its removal', () => {
    const withCover = makeTrip({ cover: makeCover('castle') });
    const values = toFormValues(withCover);
    expect(values.cover).toEqual(makeCover('castle'));
    // The same photo picked again is no change.
    expect(toTripPatch({ ...values, cover: makeCover('castle') }, withCover)).toEqual({});
    expect(toTripPatch({ ...values, cover: makeCover('tower') }, withCover)).toEqual({
      cover: makeCover('tower'),
    });
    expect(toTripPatch({ ...values, cover: null }, withCover)).toEqual({ cover: null });
  });
});

const POINTS: Record<string, { lat: number; lng: number }> = {
  ICN: { lat: 37.46, lng: 126.44 },
  KIX: { lat: 34.43, lng: 135.24 },
  NRT: { lat: 35.76, lng: 140.39 },
};

function leg(number: string, from: [string, string], to: [string, string], date = '2026-11-10'): FlightLeg {
  const end = ([iata, countryCode]: [string, string], time: string) => ({
    iata,
    name: iata,
    countryCode,
    location: POINTS[iata] ?? null,
    date,
    time,
    terminal: null,
  });
  return { number, airline: 'Korean Air', departure: end(from, '09:00'), arrival: end(to, '11:00') };
}

const found = (key: number, number: string, date: string, legs: FlightLeg[]): FlightDraft => ({
  key,
  number,
  date,
  lookup: { number, date, result: { status: 'ok', flights: legs } },
  leg: 0,
});

const OUT = found(1, 'KE723', '2026-11-10', [leg('KE723', ['ICN', 'KR'], ['KIX', 'JP'])]);
const BACK = found(2, 'KE724', '2026-11-12', [leg('KE724', ['KIX', 'JP'], ['ICN', 'KR'], '2026-11-12')]);

describe('flights of a new trip', () => {
  it('add the countries they land in, not home', () => {
    expect(withFlightCountries([], [OUT], OUT)).toEqual(['JP']);
    expect(withFlightCountries(['JP'], [OUT, BACK], BACK)).toEqual(['JP']);
    const via = found(3, 'CX411', '2026-11-11', [leg('CX411', ['KIX', 'JP'], ['HKG', 'HK'])]);
    expect(withFlightCountries(['TW', 'JP'], [OUT, via, BACK], via)).toEqual(['TW', 'JP', 'HK']);
  });
});
