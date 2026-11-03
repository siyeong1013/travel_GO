import { describe, expect, it } from 'vitest';
import {
  CLOSE_ZOOM,
  directionsUrl,
  routeFrame,
  routeLegs,
  routeStops,
  unplacedNumbers,
} from '@/features/map/route';
import { makeItem, makePlace, namedPlace } from '@/test/fixtures';

const CASTLE = { lat: 34.6873, lng: 135.5262 };
const DOTONBORI = { lat: 34.6686, lng: 135.5011 };
const UMEDA = { lat: 34.7055, lng: 135.4903 };

const item = (name: string, location: { lat: number; lng: number } | null) =>
  makeItem({
    tripId: 'trip',
    place: location ? makePlace(name, { location }) : namedPlace(name),
  });

describe('route stops', () => {
  it('numbers places like the list and leaves out the ones without a location', () => {
    const items = [item('오사카성', CASTLE), item('호텔 체크인', null), item('도톤보리', DOTONBORI)];
    expect(routeStops(items).map(({ number, name }) => [number, name])).toEqual([
      [1, '오사카성'],
      [3, '도톤보리'],
    ]);
    expect(unplacedNumbers(items)).toEqual([2]);
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
