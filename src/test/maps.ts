// A stand-in for the map and marker libraries of the Maps JavaScript API, for map tests
// (`stubMapsApi` in test/app.tsx puts it on the page; unit tests hand `libraries` to `createRouteMap`).
import type { GeoPoint } from '@/data/models';

export interface FakeMap {
  container: HTMLElement;
  options: google.maps.MapOptions;
  /** Every camera change: `{ bounds, padding }` from fitBounds, or moveCamera's options. */
  cameras: unknown[];
}

export interface FakeMarker {
  position: GeoPoint;
  title: string;
  content: HTMLElement;
  zIndex: number;
  /** Null once taken off the map. */
  map: unknown;
}

export interface FakeLine {
  path: GeoPoint[];
  map: unknown;
}

export interface FakeMapsApi {
  libraries: { maps: google.maps.MapsLibrary; marker: google.maps.MarkerLibrary };
  /** Every map created. */
  maps: FakeMap[];
  /** Markers on a map now (as `[number, title]`, in the order they were added). */
  markers: () => [string | null, string][];
  /** Every line drawn. */
  lines: FakeLine[];
}

export function fakeMapsApi(): FakeMapsApi {
  const maps: FakeMap[] = [];
  const markers: FakeMarker[] = [];
  const lines: FakeLine[] = [];

  class Map implements FakeMap {
    cameras: unknown[] = [];
    constructor(
      public container: HTMLElement,
      public options: google.maps.MapOptions,
    ) {
      maps.push(this);
    }
    fitBounds(bounds: google.maps.LatLngBoundsLiteral, padding: number) {
      this.cameras.push({ bounds, padding });
    }
    moveCamera(camera: google.maps.CameraOptions) {
      this.cameras.push(camera);
    }
  }

  class Polyline implements FakeLine {
    path: GeoPoint[] = [];
    map: unknown;
    constructor({ map }: google.maps.PolylineOptions) {
      this.map = map;
      lines.push(this);
    }
    setPath(path: GeoPoint[]) {
      this.path = [...path];
    }
    setMap(map: unknown) {
      this.map = map;
    }
  }

  class AdvancedMarkerElement {
    constructor(options: FakeMarker) {
      markers.push(Object.assign(this, options));
    }
  }

  return {
    libraries: {
      maps: { Map, Polyline } as unknown as google.maps.MapsLibrary,
      marker: { AdvancedMarkerElement } as unknown as google.maps.MarkerLibrary,
    },
    maps,
    markers: () =>
      markers.filter((marker) => marker.map != null).map((m) => [m.content.textContent, m.title]),
    lines,
  };
}
