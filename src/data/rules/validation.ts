import type { CurrencyCode, GeoPoint, LocalTime, PlaceSnapshot } from '@/data/models';
import { type NewTrip, ValidationError } from '@/data/repositories';
import { isCurrency, MAX_AMOUNT } from '@/data/rules/money';
import { isLocalDate, isLocalTime } from '@/lib/dates';

export function cleanSettlementCurrency(code: CurrencyCode): CurrencyCode {
  if (!isCurrency(code)) throw new ValidationError(`unsupported currency: ${code}`);
  return code;
}

/** null (no budget) or a whole number of minor units, 0 allowed. */
export function cleanBudget(budget: number | null): number | null {
  if (budget === null) return null;
  if (!Number.isSafeInteger(budget) || budget < 0 || budget > MAX_AMOUNT) {
    throw new ValidationError('budget must be a whole number of minor units');
  }
  return budget;
}

export function isGeoPoint(value: unknown): value is GeoPoint {
  if (typeof value !== 'object' || value === null) return false;
  const { lat, lng } = value as Record<string, unknown>;
  return (
    typeof lat === 'number' && typeof lng === 'number' && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  );
}

function cleanLocation(location: GeoPoint | null, field: string): GeoPoint | null {
  if (location === null) return null;
  if (!isGeoPoint(location)) throw new ValidationError(`${field} is not a valid lat/lng`);
  return { lat: location.lat, lng: location.lng };
}

/** Trims and validates trip fields. Throws `ValidationError`. */
export function cleanTripFields(input: NewTrip): NewTrip {
  const title = input.title.trim();
  const cityName = input.city.name.trim();
  if (!title) throw new ValidationError('title is required');
  if (!cityName) throw new ValidationError('city name is required');
  if (!isLocalDate(input.startDate) || !isLocalDate(input.endDate)) {
    throw new ValidationError('dates must be YYYY-MM-DD');
  }
  if (input.endDate < input.startDate) throw new ValidationError('endDate is before startDate');

  return {
    title,
    city: {
      name: cityName,
      placeId: input.city.placeId,
      location: cleanLocation(input.city.location, 'city.location'),
    },
    startDate: input.startDate,
    endDate: input.endDate,
  };
}

export function cleanPlace(place: PlaceSnapshot): PlaceSnapshot {
  const name = place.name.trim();
  if (!name) throw new ValidationError('place name is required');
  return {
    placeId: place.placeId,
    name,
    address: place.address?.trim() || null,
    location: cleanLocation(place.location, 'place.location'),
  };
}

/** `''` (a cleared time input) becomes null. */
export function cleanTime(time: LocalTime | null | undefined): LocalTime | null {
  if (time == null || time === '') return null;
  if (!isLocalTime(time)) throw new ValidationError('time must be HH:mm');
  return time;
}
