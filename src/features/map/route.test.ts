import { describe, expect, it } from 'vitest';
import {
  CLOSE_ZOOM,
  directionsUrl,
  distanceMeters,
  itemNumbers,
  legsAbove,
  routeFrame,
  routeLegs,
  routeStops,
  unplacedNumbers,
} from '@/features/map/route';
import { flightItems } from '@/features/schedule/flightItem';
import type { FlightLeg } from '@/lib/flights';
import { makeItem, makePlace, namedPlace } from '@/test/fixtures';

const CASTLE = { lat: 34.6873, lng: 135.5262 };
const DOTONBORI = { lat: 34.6686, lng: 135.5011 };
const UMEDA = { lat: 34.7055, lng: 135.4903 };

const item = (name: string, location: { lat: number; lng: number } | null) =>
  makeItem({
    tripId: 'trip',
    place: location ? makePlace(name, { location }) : namedPlace(name),
  });

const INCHEON = { lat: 37.4691, lng: 126.451 };
const KANSAI = { lat: 34.4347, lng: 135.244 };
const end = (iata: string, location: { lat: number; lng: number }, time: string) => ({
  iata,
  name: iata,
  countryCode: null,
  location,
  date: '2026-11-10',
  time,
  terminal: null,
});
const KE723: FlightLeg = {
  number: 'KE723',
  airline: 'Korean Air',
  departure: end('ICN', INCHEON, '09:00'),
  arrival: end('KIX', KANSAI, '10:55'),
};
/** The airport it leaves from, the flight, the airport it lands at: as items. */
const flight = (leg: FlightLeg) =>
  flightItems(leg).map((made) => makeItem({ tripId: 'trip', ...made }));

describe('route stops', () => {
  it('numbers places like the list and leaves out the ones without a location', () => {
    const items = [item('오사카성', CASTLE), item('호텔 체크인', null), item('도톤보리', DOTONBORI)];
    expect(routeStops(items).map(({ number, name }) => [number, name])).toEqual([
      [1, '오사카성'],
      [3, '도톤보리'],
    ]);
    expect(unplacedNumbers(items)).toEqual([2]);
  });

  it('numbers places only: a flight has none, the airports on either side of it go on', () => {
    const items = [item('호텔 체크아웃', CASTLE), ...flight(KE723), item('공항 가기', null)];
    expect(itemNumbers(items)).toEqual([1, 2, null, 3, 4]);
    // A flight known by its number alone is a flight too.
    expect(itemNumbers([item('KE723', null), item('도톤보리', DOTONBORI)])).toEqual([null, 1]);
    expect(routeStops(items).map(({ number, name }) => [number, name])).toEqual([
      [1, '호텔 체크아웃'],
      [2, '인천 공항 (ICN)'],
      [3, '간사이 공항 (KIX)'],
    ]);
    expect(unplacedNumbers(items)).toEqual([4]);
  });

  it('makes a leg of each stop to the next, except to the same spot', () => {
    const stops = routeStops([
      item('호텔 체크인', CASTLE),
      item('호텔 조식', CASTLE),
      item('도톤보리', DOTONBORI),
      item('우메다', UMEDA),
    ]);
    expect(routeLegs(stops).map(({ from, to }) => [from.number, to.number])).toEqual([
      [2, 3],
      [3, 4],
    ]);
    expect(routeLegs(stops.slice(0, 1))).toEqual([]);
  });

  it('makes no leg of a flight, from one airport of the flight data to another', () => {
    const airport = (name: string, location: { lat: number; lng: number }) =>
      makeItem({
        tripId: 'trip',
        place: { placeId: null, name, address: null, location, fetchedAt: null },
      });
    const stops = routeStops([
      airport('인천 공항 (ICN)', { lat: 37.4691, lng: 126.451 }),
      airport('간사이 공항 (KIX)', { lat: 34.4347, lng: 135.244 }),
      item('도톤보리', DOTONBORI),
    ]);
    // From the airport landed at, the way is there.
    expect(routeLegs(stops).map(({ from, to }) => [from.number, to.number])).toEqual([[2, 3]]);
  });
});

describe('legs in the list', () => {
  it('sit under the item right above each destination', () => {
    const items = [
      item('오사카성', CASTLE),
      item('호텔 체크인', null),
      item('도톤보리', DOTONBORI),
      item('우메다', UMEDA),
      item('공항 가기', null),
    ];
    const legs = legsAbove(items);
    // 1 → 3 under the hotel (2), 3 → 4 under 3; nothing under 1 or the last two.
    const placed = [...legs].map(([id, leg]) => {
      const under = items.findIndex((i) => i.id === id) + 1;
      return [under, leg.from.number, leg.to.number];
    });
    expect(placed).toEqual([
      [2, 1, 3],
      [3, 3, 4],
    ]);
  });

  it('don’t go across a flight', () => {
    const [airport, plane] = flight(KE723);
    // Its airport landed at left out: no way from the one it left from to where it went.
    const items = [airport!, plane!, item('도톤보리', DOTONBORI), item('우메다', UMEDA)];
    const legs = legsAbove(items);
    expect([...legs].map(([id, leg]) => [id, leg.from.name, leg.to.name])).toEqual([
      [items[2]!.id, '도톤보리', '우메다'],
    ]);
    // A flight known by its number alone too.
    const typed = [item('오사카성', CASTLE), item('KE723', null), item('도톤보리', DOTONBORI)];
    expect(legsAbove(typed).size).toBe(0);
  });

  it('measure the straight-line distance', () => {
    expect(distanceMeters(CASTLE, DOTONBORI)).toBeCloseTo(3_096, -1);
    expect(distanceMeters(CASTLE, CASTLE)).toBe(0);
  });
});

describe('directionsUrl', () => {
  it('names both places by place ID (with the name, which Maps only uses without the ID)', () => {
    const [from, to] = routeStops([item('성 구경', CASTLE), item('도톤보리', DOTONBORI)]);
    const url = new URL(directionsUrl({ from: from!, to: to! }));
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      api: '1',
      origin: '성 구경',
      origin_place_id: 'place-성 구경',
      destination: '도톤보리',
      destination_place_id: 'place-도톤보리',
    });
  });

  it('uses the coordinates for a place without an ID', () => {
    const [from, to] = routeStops([
      item('오사카성', CASTLE),
      makeItem({ tripId: 'trip', place: { ...namedPlace('친구 집'), location: UMEDA } }),
    ]);
    const params = new URL(directionsUrl({ from: from!, to: to! })).searchParams;
    expect(params.get('destination')).toBe('34.7055,135.4903');
    expect(params.has('destination_place_id')).toBe(false);
  });
});

describe('routeFrame', () => {
  it('fits the camera around the stops', () => {
    const stops = routeStops([item('오사카성', CASTLE), item('도톤보리', DOTONBORI), item('우메다', UMEDA)]);
    expect(routeFrame(stops)).toEqual({
      bounds: { south: 34.6686, west: 135.4903, north: 34.7055, east: 135.5262 },
    });
  });

  it('shows one spot (or stops a few steps apart) close up instead of zooming in all the way', () => {
    expect(routeFrame(routeStops([item('오사카성', CASTLE)]))).toEqual({
      center: CASTLE,
      zoom: CLOSE_ZOOM,
    });
    const nearby = routeStops([
      item('입구', CASTLE),
      item('천수각', { lat: CASTLE.lat + 0.001, lng: CASTLE.lng + 0.001 }),
    ]);
    expect(routeFrame(nearby)).toEqual({
      center: { lat: expect.closeTo(34.6878, 6), lng: expect.closeTo(135.5267, 6) },
      zoom: CLOSE_ZOOM,
    });
  });
});
