import type { Trip } from '@/data/models';
import type { NewTrip, TripPatch } from '@/data/repositories';
import { isLocalDate } from '@/lib/dates';

export interface TripFormValues {
  title: string;
  city: string;
  startDate: string;
  endDate: string;
}

export type TripFormErrors = Partial<Record<keyof TripFormValues, string>>;

/** Field order, used to focus the first invalid field. */
export const TRIP_FORM_FIELDS = ['title', 'city', 'startDate', 'endDate'] as const;

export const emptyTripForm: TripFormValues = { title: '', city: '', startDate: '', endDate: '' };

export const TITLE_MAX_LENGTH = 40;

export function validateTripForm(values: TripFormValues): TripFormErrors {
  const errors: TripFormErrors = {};
  if (!values.title.trim()) errors.title = '여행 이름을 입력해 주세요.';
  if (!values.city.trim()) errors.city = '도시를 입력해 주세요.';
  if (!isLocalDate(values.startDate)) errors.startDate = '시작일을 선택해 주세요.';
  if (!isLocalDate(values.endDate)) errors.endDate = '종료일을 선택해 주세요.';
  else if (isLocalDate(values.startDate) && values.endDate < values.startDate) {
    errors.endDate = '종료일은 시작일과 같거나 그 이후여야 해요.';
  }
  return errors;
}

/** Changing the start date pulls the end date along when it would end up empty or earlier. */
export function withStartDate(values: TripFormValues, startDate: string): TripFormValues {
  const endDate =
    startDate && (!values.endDate || values.endDate < startDate) ? startDate : values.endDate;
  return { ...values, startDate, endDate };
}

export function toFormValues(trip: Trip): TripFormValues {
  return {
    title: trip.title,
    city: trip.city.name,
    startDate: trip.startDate,
    endDate: trip.endDate,
  };
}

/**
 * Only the fields that changed (empty when nothing did). Keeps the city's place data unless
 * its name changed. Call only with values that passed `validateTripForm`.
 */
export function toTripPatch(values: TripFormValues, trip: Trip): TripPatch {
  const next = toNewTrip(values);
  const patch: TripPatch = {};
  if (next.title !== trip.title) patch.title = next.title;
  if (next.city.name !== trip.city.name) patch.city = next.city;
  if (next.startDate !== trip.startDate) patch.startDate = next.startDate;
  if (next.endDate !== trip.endDate) patch.endDate = next.endDate;
  return patch;
}

/** Call only with values that passed `validateTripForm`. */
export function toNewTrip(values: TripFormValues): NewTrip {
  return {
    title: values.title.trim(),
    // Typed by hand until place search (step 6) fills in placeId/location.
    city: { name: values.city.trim(), placeId: null, location: null },
    startDate: values.startDate,
    endDate: values.endDate,
  };
}
