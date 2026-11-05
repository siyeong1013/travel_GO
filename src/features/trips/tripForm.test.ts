import { describe, expect, it } from 'vitest';
import {
  emptyTripForm,
  type FlightDraft,
  flightScheduleItems,
  formCities,
  foundLegs,
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

function leg(number: string, from: [string, string], to: [string, string], date = '2026-11-10'): FlightLeg {
  return {
    number,
    airline: 'Korean Air',
    departure: { iata: from[0], name: from[0], countryCode: from[1], date, time: '09:00', terminal: null },
    arrival: { iata: to[0], name: to[0], countryCode: to[1], date, time: '11:00', terminal: null },
  };
}

const found = (key: number, number: string, date: string, legs: FlightLeg[]): FlightDraft => ({
  key,
  number,
  date,
  lookup: { number, date, result: { status: 'ok', flights: legs } },
});

const OUT = found(1, 'KE723', '2026-11-10', [leg('KE723', ['ICN', 'KR'], ['KIX', 'JP'])]);
const BACK = found(2, 'KE724', '2026-11-12', [leg('KE724', ['KIX', 'JP'], ['ICN', 'KR'], '2026-11-12')]);

describe('flights of a new trip', () => {
  it('count as found for the number and day they were looked up for', () => {
    expect(foundLegs(OUT)).toHaveLength(1);
    expect(foundLegs({ ...OUT, number: 'ke 723' })).toHaveLength(1);
    expect(foundLegs({ ...OUT, number: 'KE724' })).toEqual([]);
    expect(foundLegs({ ...OUT, date: '2026-11-11' })).toEqual([]);
    expect(foundLegs({ ...OUT, lookup: { number: 'KE723', date: '2026-11-10', result: null } })).toEqual([]);
  });

  it('add the countries they land in, not home', () => {
    expect(withFlightCountries([], [OUT], OUT)).toEqual(['JP']);
    expect(withFlightCountries(['JP'], [OUT, BACK], BACK)).toEqual(['JP']);
    const via = found(3, 'CX411', '2026-11-11', [leg('CX411', ['KIX', 'JP'], ['HKG', 'HK'])]);
    expect(withFlightCountries(['TW', 'JP'], [OUT, via, BACK], via)).toEqual(['TW', 'JP', 'HK']);
  });

  it('go into the schedule on the day they leave, or the inbox outside the trip', () => {
    const trip = { id: 'trip', startDate: '2026-11-10', endDate: '2026-11-12' };
    const early = found(3, 'KE721', '2026-11-09', [leg('KE721', ['ICN', 'KR'], ['NRT', 'JP'], '2026-11-09')]);
    const typed: FlightDraft = { key: 4, number: 'oz 112', date: '2026-11-11', lookup: null };
    const junk: FlightDraft = { key: 5, number: '여권 챙기기', date: '2026-11-11', lookup: null };

    const items = flightScheduleItems([OUT, early, typed, junk], trip);
    expect(items.map((item) => [item.date, item.place.name, item.time])).toEqual([
      ['2026-11-10', 'KE723 인천 → 간사이', '09:00'],
      [null, 'KE721 인천 → 나리타', '09:00'],
      ['2026-11-11', 'OZ112', null],
    ]);
    expect(items[0]!.memo).toBe('Korean Air · 인천 출발 → 간사이 도착 11:00');
    expect(items[0]!.place).toEqual({
      placeId: null,
      name: 'KE723 인천 → 간사이',
      address: null,
      location: null,
      fetchedAt: null,
    });
  });
});
