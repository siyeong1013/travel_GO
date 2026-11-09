/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from 'vitest';
import { routeStops } from '@/features/map/route';
import { createRouteMap, FOCUS_ZOOM } from '@/features/map/routeMap';
import { makeItem, makePlace } from '@/test/fixtures';
import { fakeMapsApi } from '@/test/maps';

const CASTLE = { lat: 34.6873, lng: 135.5262 };
const DOTONBORI = { lat: 34.6686, lng: 135.5011 };
const UMEDA = { lat: 34.7055, lng: 135.4903 };

const stops = (...places: [string, { lat: number; lng: number }][]) =>
  routeStops(
    places.map(([name, location]) => makeItem({ tripId: 'trip', place: makePlace(name, { location }) })),
  );

describe('route map', () => {
  it('draws numbered markers and a straight line through them in order', () => {
    const api = fakeMapsApi();
    const routeMap = createRouteMap(document.createElement('div'), api.libraries);

    routeMap.show(stops(['오사카성', CASTLE], ['도톤보리', DOTONBORI]));

    expect(api.markers()).toEqual([
      ['1', '1번 오사카성'],
      ['2', '2번 도톤보리'],
    ]);
    expect(api.lines[0]!.path).toEqual([CASTLE, DOTONBORI]);
    const [map] = api.maps;
    expect(map!.cameras).toEqual([
      {
        bounds: { south: DOTONBORI.lat, west: DOTONBORI.lng, north: CASTLE.lat, east: CASTLE.lng },
        padding: 24,
      },
    ]);
    // Page scroll goes past the map; no Google popups for places on the base map.
    expect(map!.options).toMatchObject({ gestureHandling: 'cooperative', clickableIcons: false });
  });

  it("uses the Map ID from .env.local, else Google's demo ID", () => {
    const api = fakeMapsApi();
    createRouteMap(document.createElement('div'), api.libraries);
    vi.stubEnv('VITE_GOOGLE_MAPS_MAP_ID', 'my-map-id');
    createRouteMap(document.createElement('div'), api.libraries);
    expect(api.maps.map((map) => map.options.mapId)).toEqual(['DEMO_MAP_ID', 'my-map-id']);
  });

  it('redraws for new stops, and moves the camera only when the places change', () => {
    const api = fakeMapsApi();
    const routeMap = createRouteMap(document.createElement('div'), api.libraries);
    routeMap.show(stops(['오사카성', CASTLE], ['도톤보리', DOTONBORI]));

    routeMap.show(stops(['도톤보리', DOTONBORI], ['오사카성', CASTLE]));
    expect(api.markers()).toEqual([
      ['1', '1번 도톤보리'],
      ['2', '2번 오사카성'],
    ]);
    expect(api.lines[0]!.path).toEqual([DOTONBORI, CASTLE]);
    expect(api.maps[0]!.cameras).toHaveLength(1);

    routeMap.show(stops(['도톤보리', DOTONBORI], ['오사카성', CASTLE], ['우메다', UMEDA]));
    expect(api.maps[0]!.cameras).toHaveLength(2);
  });

  it('brings a stop up close, and the whole route back', () => {
    const api = fakeMapsApi();
    const routeMap = createRouteMap(document.createElement('div'), api.libraries);
    const day = stops(['오사카성', CASTLE], ['도톤보리', DOTONBORI], ['우메다', UMEDA]);
    routeMap.show(day);
    const map = api.maps[0]!;
    expect(api.focused()).toBeNull();

    // From the whole route: near enough to see around it.
    routeMap.focus(day[1]!.id);
    expect(api.focused()).toBe('2번 도톤보리');
    expect(map.cameras.at(-1)).toEqual({ center: DOTONBORI, zoom: FOCUS_ZOOM });
    // Close already: sliding over.
    routeMap.focus(day[2]!.id);
    expect(api.focused()).toBe('3번 우메다');
    expect(map.cameras.at(-1)).toEqual({ panTo: UMEDA });
    const moves = map.cameras.length;
    routeMap.focus(day[2]!.id);
    // Redrawn in another order: still up close, the camera where it is.
    routeMap.show([day[2]!, day[0]!, day[1]!].map((stop, i) => ({ ...stop, number: i + 1 })));
    expect(api.focused()).toBe('1번 우메다');
    expect(map.cameras).toHaveLength(moves);

    routeMap.focus(null);
    expect(api.focused()).toBeNull();
    expect(map.cameras.at(-1)).toMatchObject({ padding: 24 });
    // One that isn't on the map: the whole route still.
    routeMap.focus('elsewhere');
    expect(map.cameras).toHaveLength(moves + 1);
  });

  it('takes everything off the map when destroyed', () => {
    const api = fakeMapsApi();
    const routeMap = createRouteMap(document.createElement('div'), api.libraries);
    routeMap.show(stops(['오사카성', CASTLE], ['도톤보리', DOTONBORI]));

    routeMap.destroy();

    expect(api.markers()).toEqual([]);
    expect(api.lines[0]!.map).toBeNull();
  });
});
