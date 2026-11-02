import { describe, expect, it } from 'vitest';
import {
  emptyTripForm,
  toFormValues,
  toNewTrip,
  toTripPatch,
  type TripFormValues,
  validateTripForm,
  withStartDate,
} from '@/features/trips/tripForm';
import { makeTrip } from '@/test/fixtures';

const valid: TripFormValues = {
  title: '오사카 여행',
  city: '오사카',
  startDate: '2026-11-10',
  endDate: '2026-11-12',
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

describe('toNewTrip', () => {
  it('trims text and leaves the city unlinked to a place for now', () => {
    expect(toNewTrip({ ...valid, title: ' 오사카 여행 ', city: ' 오사카 ' })).toEqual({
      title: '오사카 여행',
      city: { name: '오사카', placeId: null, location: null },
      startDate: '2026-11-10',
      endDate: '2026-11-12',
    });
  });
});

describe('toTripPatch', () => {
  const trip = makeTrip({
    title: '오사카 여행',
    city: { name: '오사카', placeId: 'osaka', location: { lat: 34.69, lng: 135.5 } },
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
      city: { name: '교토', placeId: null, location: null },
    });
  });
});
