import type { GeoPoint, ID, ScheduleItem } from '@/data/models';
import { isFlightItem } from '@/features/schedule/flightItem';

/** A place of the day on the map, with the number of its card. */
export interface RouteStop {
  id: ID;
  number: number;
  name: string;
  placeId: string | null;
  location: GeoPoint;
}

/** Two stops in a row, for directions. */
export interface RouteLeg {
  from: RouteStop;
  to: RouteStop;
}

/**
 * The numbers of the day's items, as the list and the map show them: places from 1, in order; a
 * flight has none (the list shows a plane), so the airports on either side of it go on.
 */
export function itemNumbers(items: ScheduleItem[]): (number | null)[] {
  let last = 0;
  return items.map((item) => (isFlightItem(item) ? null : ++last));
}

/** The day's items that have a location, in order, numbered like the list (`itemNumbers`). */
export function routeStops(items: ScheduleItem[]): RouteStop[] {
  const numbers = itemNumbers(items);
  return items.flatMap(({ id, place }, index) => {
    const number = numbers[index];
    return place.location && number != null
      ? [{ id, number, name: place.name, placeId: place.placeId, location: place.location }]
      : [];
  });
}

/** Numbers of the day's places without a location, which the map leaves out. */
export function unplacedNumbers(items: ScheduleItem[]): number[] {
  return itemNumbers(items).flatMap((number, index) =>
    number === null || items[index]!.place.location ? [] : [number],
  );
}

/**
 * Each stop to the next, except to the same spot (e.g. checking out of the hotel checked into),
 * and a flight: from one airport of the flight data to another (the only places with a point and
 * no place ID), no way to look up.
 */
export function routeLegs(stops: RouteStop[]): RouteLeg[] {
  return stops.slice(1).flatMap((to, index) => {
    const from = stops[index]!;
    const flight = from.placeId === null && to.placeId === null;
    return flight || samePoint(from.location, to.location) ? [] : [{ from, to }];
  });
}

/**
 * Each leg, keyed by the item listed right above its destination: the list shows it there,
 * between the two places, or under the items without a location that it passes. None goes across
 * a flight: there's no way to look up from before it to after it.
 */
export function legsAbove(items: ScheduleItem[]): Map<ID, RouteLeg> {
  const indexOf = new Map(items.map((item, index) => [item.id, index]));
  const legs = new Map<ID, RouteLeg>();
  for (const leg of routeLegs(routeStops(items))) {
    const from = indexOf.get(leg.from.id)!;
    const to = indexOf.get(leg.to.id)!;
    if (items.slice(from + 1, to).some(isFlightItem)) continue;
    legs.set(items[to - 1]!.id, leg);
  }
  return legs;
}

const EARTH_RADIUS_METERS = 6_371_000;

/** Straight-line (great-circle) distance between two places, in meters. */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

const samePoint = (a: GeoPoint, b: GeoPoint) => a.lat === b.lat && a.lng === b.lng;
const pointText = ({ lat, lng }: GeoPoint) => `${lat},${lng}`;

/** Directions in Google Maps (the site, or the app on phones), which picks the travel mode. */
export function directionsUrl({ from, to }: RouteLeg): string {
  const params = new URLSearchParams({ api: '1' });
  setEnd(params, 'origin', from);
  setEnd(params, 'destination', to);
  return `https://www.google.com/maps/dir/?${params}`;
}

/**
 * A place ID decides the place, and the text beside it (required) only counts if Maps cannot find
 * the ID. Given coordinates instead of a name, Maps ignores the ID and starts from whatever is
 * nearest to them, so places without an ID are the only ones sent as coordinates.
 */
function setEnd(params: URLSearchParams, end: 'origin' | 'destination', stop: RouteStop) {
  if (stop.placeId) {
    params.set(end, stop.name);
    params.set(`${end}_place_id`, stop.placeId);
  } else {
    params.set(end, pointText(stop.location));
  }
}

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Where the camera goes: around the stops, or close up when they are all about one spot. */
export type RouteFrame = { bounds: Bounds } | { center: GeoPoint; zoom: number };

/** Stops closer together than this (in degrees, about 200m) are shown at CLOSE_ZOOM. */
const CLOSE_SPAN = 0.002;
/** A few streets around: fitting the bounds of one spot would zoom in all the way. */
export const CLOSE_ZOOM = 16;

/** The camera for `stops` (at least one). */
export function routeFrame(stops: RouteStop[]): RouteFrame {
  const lats = stops.map((stop) => stop.location.lat);
  const lngs = stops.map((stop) => stop.location.lng);
  const bounds = {
    south: Math.min(...lats),
    west: Math.min(...lngs),
    north: Math.max(...lats),
    east: Math.max(...lngs),
  };
  if (bounds.north - bounds.south < CLOSE_SPAN && bounds.east - bounds.west < CLOSE_SPAN) {
    const center = { lat: (bounds.south + bounds.north) / 2, lng: (bounds.west + bounds.east) / 2 };
    return { center, zoom: CLOSE_ZOOM };
  }
  return { bounds };
}
