import { describe, expect, it } from 'vitest';
import {
  emptyTripForm,
  linkedCity,
  toFormValues,
  toNewTrip,
  toTripPatch,
  type TripFormValues,
  validateTripForm,
  withStartDate,
} from '@/features/trips/tripForm';
import { makeCover, makeTrip, T0, typedCity } from '@/test/fixtures';

const valid: TripFormValues = {
  title: '오사카 여행',
  city: '오사카',
  cityPlace: null,
  startDate: '2026-11-10',
  endDate: '2026-11-12',
  cover: null,
};

describe('validateTripForm', () => {
  it('requires every field', () => {
    expect(Object.keys(validateTripForm(emptyTripForm))).toEqual([
      'title',
      'city',
      'startDate',
      'endDate',
    ]);
    expect(validateTripForm({ ...valid, title: '   ' })).toHaveProperty('title');
  });

  it('rejects an end date before the start date', () => {
    expect(validateTripForm({ ...valid, endDate: '2026-11-09' })).toEqual({
      endDate: '종료일은 시작일과 같거나 그 이후여야 해요.',
    });
    expect(validateTripForm(valid)).toEqual({});
    expect(validateTripForm({ ...valid, endDate: valid.startDate })).toEqual({});
  });
});

describe('withStartDate', () => {
  it('pulls an empty or earlier end date along with the start date', () => {
    expect(withStartDate(emptyTripForm, '2026-11-10').endDate).toBe('2026-11-10');
    expect(withStartDate(valid, '2026-11-15').endDate).toBe('2026-11-15');
  });

  it('keeps a later end date, and keeps the end date when the start is cleared', () => {
    expect(withStartDate(valid, '2026-11-11').endDate).toBe('2026-11-12');
    expect(withStartDate(valid, '').endDate).toBe('2026-11-12');
  });
});

const OSAKA = {
  name: '오사카',
  placeId: 'osaka',
  location: { lat: 34.69, lng: 135.5 },
  fetchedAt: T0,
};

describe('toNewTrip', () => {
  it('trims text; a typed city has no place', () => {
    expect(toNewTrip({ ...valid, title: ' 오사카 여행 ', city: ' 오사카 ' })).toEqual({
      title: '오사카 여행',
      city: { name: '오사카', placeId: null, location: null, fetchedAt: null },
      startDate: '2026-11-10',
      endDate: '2026-11-12',
      cover: null,
    });
    expect(toNewTrip({ ...valid, cover: makeCover() }).cover).toEqual(makeCover());
  });

  it('keeps the found city while the field reads its name', () => {
    expect(toNewTrip({ ...valid, city: '오사카 ', cityPlace: OSAKA }).city).toEqual(OSAKA);
    expect(linkedCity({ ...valid, city: '오사', cityPlace: OSAKA })).toBeNull();
    expect(toNewTrip({ ...valid, city: '교토', cityPlace: OSAKA }).city).toEqual(typedCity('교토'));
  });
});

describe('toTripPatch', () => {
  const trip = makeTrip({
    title: '오사카 여행',
    city: OSAKA,
    startDate: '2026-11-10',
    endDate: '2026-11-12',
  });

  it('is empty when nothing changed', () => {
    expect(toTripPatch(toFormValues(trip), trip)).toEqual({});
  });

  it('has only the changed fields, and keeps the city place data unless its name changed', () => {
    const values = toFormValues(trip);
    expect(toTripPatch({ ...values, title: ' 간사이 여행 ' }, trip)).toEqual({ title: '간사이 여행' });
    expect(toTripPatch({ ...values, endDate: '2026-11-11' }, trip)).toEqual({
      endDate: '2026-11-11',
    });
    expect(toTripPatch({ ...values, city: '교토' }, trip)).toEqual({
      city: { name: '교토', placeId: null, location: null, fetchedAt: null },
    });
    // Typed back to the same name: still the same place.
    expect(toTripPatch({ ...values, city: '오사카' }, trip)).toEqual({});
  });

  it('saves a newly found city, or one linked to a typed city', () => {
    const kyoto = {
      name: '교토',
      placeId: 'kyoto',
      location: { lat: 35.01, lng: 135.77 },
      fetchedAt: T0,
    };
    expect(toTripPatch({ ...toFormValues(trip), city: '교토', cityPlace: kyoto }, trip)).toEqual({
      city: kyoto,
    });
    const typed = makeTrip({ city: { name: '오사카', placeId: null, location: null, fetchedAt: null } });
    expect(toFormValues(typed).cityPlace).toBeNull();
    expect(toTripPatch({ ...toFormValues(typed), cityPlace: OSAKA }, typed)).toEqual({ city: OSAKA });
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
    expect(toTripPatch({ ...toFormValues(trip), cover: makeCover() }, trip)).toEqual({
      cover: makeCover(),
    });
  });
});
