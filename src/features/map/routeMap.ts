import { type RouteStop, routeFrame } from '@/features/map/route';
import { googleMapsMapId, importMapsLibrary } from '@/lib/googleMaps';

export interface RouteMapLibraries {
  maps: google.maps.MapsLibrary;
  marker: google.maps.MarkerLibrary;
}

/** A Google map showing a day's stops. */
export interface RouteMap {
  /** Numbered markers and a straight line through them in order. */
  show(stops: RouteStop[]): void;
  /** Takes the markers and the line off the map. */
  destroy(): void;
}

export async function loadRouteMapLibraries(): Promise<RouteMapLibraries> {
  const [maps, marker] = await Promise.all([
    importMapsLibrary('maps'),
    importMapsLibrary('marker'),
  ]);
  return { maps, marker };
}

/** brand-500, like the numbers on the cards. */
const LINE_COLOR = '#2f7cf6';
/** Room around the stops when fitting the camera, in px: a 28px pin on its spot fits. */
const FIT_PADDING = 24;

export function createRouteMap(container: HTMLElement, { maps, marker }: RouteMapLibraries): RouteMap {
  const map = new maps.Map(container, {
    mapId: googleMapsMapId(),
    center: { lat: 0, lng: 0 },
    zoom: 2,
    disableDefaultUI: true,
    fullscreenControl: true,
    // One finger scrolls the page past the map; two move it.
    gestureHandling: 'cooperative',
    clickableIcons: false,
  });
  const line = new maps.Polyline({
    map,
    clickable: false,
    strokeColor: LINE_COLOR,
    strokeOpacity: 0.8,
    strokeWeight: 4,
  });
  let markers: google.maps.marker.AdvancedMarkerElement[] = [];
  /** The spots the camera was last fitted to: reordering alone keeps the user's view. */
  let framed = '';

  function clearMarkers() {
    for (const old of markers) old.map = null;
    markers = [];
  }

  return {
    show(stops) {
      clearMarkers();
      markers = stops.map(
        (stop) =>
          new marker.AdvancedMarkerElement({
            map,
            position: stop.location,
            title: `${stop.number}번 ${stop.name}`,
            content: numberPin(stop.number),
            zIndex: stop.number,
          }),
      );
      line.setPath(stops.map((stop) => stop.location));

      const spots = stops.map(({ location }) => `${location.lat},${location.lng}`).sort().join(' ');
      if (stops.length === 0 || spots === framed) return;
      framed = spots;
      const frame = routeFrame(stops);
      if ('bounds' in frame) map.fitBounds(frame.bounds, FIT_PADDING);
      else map.moveCamera(frame);
    },
    destroy() {
      clearMarkers();
      line.setMap(null);
    },
  };
}

function numberPin(number: number): HTMLElement {
  const pin = document.createElement('div');
  // Moved down by half: markers stand on their spot, these circles are centered on it.
  pin.className =
    'flex size-7 translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-brand-500 text-sm font-bold text-white shadow-md';
  pin.textContent = String(number);
  return pin;
}
