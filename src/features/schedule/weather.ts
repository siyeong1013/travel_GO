import type { GeoPoint, LocalDate, ScheduleItem, Trip } from '@/data/models';
import { itemsOn } from '@/data/rules/schedule';
import { eachDateInRange } from '@/lib/dates';
import type { DayForecast } from '@/lib/weatherApi';

/**
 * An airport of a flight: a place with a point from the flight data and no place ID, the only
 * ones that have both (see `routeLegs`).
 */
const isAirport = ({ place }: ScheduleItem) => place.placeId === null && place.location !== null;

/**
 * Where each day of the trip is, for its weather: where the day ends, at its last place that is not
 * an airport (the hotel, or the next city on a day of moving on); else where the day before ended,
 * or the trip's first city before any. A day of nothing but airports (flying home) stays where it
 * was, unless nothing came before: then where it lands.
 */
export function daySpots(
  trip: Pick<Trip, 'startDate' | 'endDate' | 'cities'>,
  items: ScheduleItem[],
): Map<LocalDate, GeoPoint> {
  const spots = new Map<LocalDate, GeoPoint>();
  let spot = trip.cities.find((city) => city.location)?.location ?? null;
  for (const date of eachDateInRange(trip.startDate, trip.endDate)) {
    const located = itemsOn(items, date).filter((item) => item.place.location);
    const place = located.filter((item) => !isAirport(item)).at(-1);
    spot = place?.place.location ?? spot ?? located.at(-1)?.place.location ?? null;
    if (spot) spots.set(date, spot);
  }
  return spots;
}

/**
 * A spot as asked about, rounded to 0.1° (about 10km): the places of a city share one forecast,
 * one request.
 */
export function spotKey({ lat, lng }: GeoPoint): string {
  return `${lat.toFixed(1)},${lng.toFixed(1)}`;
}

export function keySpot(key: string): GeoPoint {
  const [lat = 0, lng = 0] = key.split(',').map(Number);
  return { lat, lng };
}

export type WeatherIconKind = 'sun' | 'partly' | 'cloud' | 'rain' | 'snow' | 'thunder' | 'wind';

/**
 * The icon for a condition type, by what matters most in it. Japan and South Korea add compound
 * types (`CLEAR_WITH_BRIEF_RAIN_LATER`, `…_RAIN_AS_MAIN_CONSTITUENT`): what falls wins.
 */
export function weatherIconKind(condition: string): WeatherIconKind {
  if (condition.includes('THUNDER')) return 'thunder';
  if (/MAIN_CONSTITUENT_RAIN|RAIN_AS_MAIN/.test(condition)) return 'rain';
  if (/SNOW|HAIL/.test(condition)) return 'snow';
  if (/RAIN|SHOWER/.test(condition)) return 'rain';
  if (condition.includes('WIND')) return 'wind';
  // Some sun among the clouds: `PARTLY_CLOUDY`, `CLOUDY_PERIODICALLY_CLEAR`.
  if (condition.includes('CLOUD')) {
    return /CLEAR|^PARTLY/.test(condition) ? 'partly' : 'cloud';
  }
  return condition.includes('CLEAR') ? 'sun' : 'cloud';
}

/** `2° / 11°`, the low and the high (as Korean weather apps write them). */
export function temperatureText({ min, max }: Pick<DayForecast, 'min' | 'max'>): string | null {
  if (min === null && max === null) return null;
  if (min === null || max === null) return `${min ?? max}°`;
  return `${min}° / ${max}°`;
}

/** `비 30%`, `눈 40%`: from 20% (below that it's noise in a line this short). */
export function precipitationText(precipitation: DayForecast['precipitation']): string | null {
  if (!precipitation || precipitation.percent < 20) return null;
  const { type, percent } = precipitation;
  const what =
    type.includes('SNOW') && type.includes('RAIN')
      ? '비·눈'
      : type.includes('SNOW')
        ? '눈'
        : type === 'SLEET'
          ? '진눈깨비'
          : '비';
  return `${what} ${percent}%`;
}

/** The day for screen readers, where the tab shows an icon and the high: `맑음, 최고 11도`. */
export function weatherLabel(day: DayForecast): string {
  return [day.description, day.max === null ? null : `최고 ${day.max}도`]
    .filter(Boolean)
    .join(', ');
}

/**
 * What the terms ask to show next to the weather, in their words: Google's, and for Japan and
 * South Korea (where Weathernews provides it) its own, told by the spots' time zones.
 */
export function weatherAttributions(timeZones: (string | null)[]): string[] {
  const zones = new Set(timeZones);
  return [
    'Source: Includes weather data from Google.',
    ...(zones.has('Asia/Tokyo') ? ['気象データ提供： 株式会社ウェザーニューズ'] : []),
    ...(zones.has('Asia/Seoul') ? ['날씨 정보 제공: 웨더뉴스'] : []),
  ];
}
