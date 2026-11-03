import type {
  CoverPhoto,
  CurrencyCode,
  GeoPoint,
  ISODateTime,
  LocalTime,
  PlaceData,
  PlaceSnapshot,
} from '@/data/models';
import { type NewTrip, ValidationError } from '@/data/repositories';
import { isCurrency, MAX_AMOUNT } from '@/data/rules/money';
import { isIsoDateTime, isLocalDate, isLocalTime } from '@/lib/dates';

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

/**
 * Google's data must say when it was fetched (it expires, `data/rules/placeData`). Data entered
 * by hand, or a Google place without data, has no fetch time.
 */
function cleanFetchedAt(
  placeId: string | null,
  hasData: boolean,
  fetchedAt: ISODateTime | null,
  field: string,
): ISODateTime | null {
  if (placeId === null || !hasData) return null;
  if (!isIsoDateTime(fetchedAt)) throw new ValidationError(`${field} is required with Google's data`);
  return fetchedAt;
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

  const location = cleanLocation(input.city.location, 'city.location');
  return {
    title,
    city: {
      name: cityName,
      placeId: input.city.placeId,
      location,
      fetchedAt: cleanFetchedAt(
        input.city.placeId,
        location !== null,
        input.city.fetchedAt,
        'city.fetchedAt',
      ),
    },
    startDate: input.startDate,
    endDate: input.endDate,
  };
}

export function cleanPlace(place: PlaceSnapshot): PlaceSnapshot {
  const name = place.name.trim();
  if (!name) throw new ValidationError('place name is required');
  const address = place.address?.trim() || null;
  const location = cleanLocation(place.location, 'place.location');
  return {
    placeId: place.placeId,
    name,
    address,
    location,
    fetchedAt: cleanFetchedAt(
      place.placeId,
      address !== null || location !== null,
      place.fetchedAt,
      'place.fetchedAt',
    ),
  };
}

/** Freshly fetched Google data (a refresh). */
export function cleanPlaceData(data: PlaceData): PlaceData {
  if (!data.placeId) throw new ValidationError('placeId is required');
  if (!isIsoDateTime(data.fetchedAt)) throw new ValidationError('fetchedAt must be ISO 8601');
  return {
    placeId: data.placeId,
    address: data.address?.trim() || null,
    location: cleanLocation(data.location, 'location'),
    fetchedAt: data.fetchedAt,
  };
}

/** Far above what the app makes (about 0.5MB and 30KB), to keep out what isn't a cover photo. */
export const COVER_IMAGE_MAX_LENGTH = 3_000_000;
export const COVER_THUMBNAIL_MAX_LENGTH = 300_000;

const IMAGE_DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/**
 * A picture held in the data itself: an image `data:` URL, never a link to elsewhere (showing
 * one from an imported file would tell that site when the app is opened).
 */
export function isImageDataUrl(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length <= maxLength && IMAGE_DATA_URL.test(value);
}

export function cleanCover(cover: CoverPhoto | null): CoverPhoto | null {
  if (cover === null) return null;
  if (!isImageDataUrl(cover.image, COVER_IMAGE_MAX_LENGTH)) {
    throw new ValidationError('cover.image must be an image data: URL');
  }
  if (!isImageDataUrl(cover.thumbnail, COVER_THUMBNAIL_MAX_LENGTH)) {
    throw new ValidationError('cover.thumbnail must be an image data: URL');
  }
  return { image: cover.image, thumbnail: cover.thumbnail };
}

/** `''` (a cleared time input) becomes null. */
export function cleanTime(time: LocalTime | null | undefined): LocalTime | null {
  if (time == null || time === '') return null;
  if (!isLocalTime(time)) throw new ValidationError('time must be HH:mm');
  return time;
}
