import type { ID } from '@/data/models';
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
  /**
   * Brings a stop up close: its marker stands out, and the camera centers on it, near enough to
   * see around it (`FOCUS_ZOOM`, or nearer as it was). Null shows the whole route again.
   */
  focus(id: ID | null): void;
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
/** A stop up close: a few streets each way (about 5km across a phone). */
export const FOCUS_ZOOM = 13;

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
  let shown: RouteStop[] = [];
  /** The stop up close, if any. */
  let focused: ID | null = null;
  /** The spots the camera was last fitted to: reordering alone keeps the user's view. */
  let framed = '';

  function clearMarkers() {
    for (const old of markers) old.map = null;
    markers = [];
  }

  /** The camera on every stop. */
  function frameAll() {
    const frame = routeFrame(shown);
    if ('bounds' in frame) map.fitBounds(frame.bounds, FIT_PADDING);
    else map.moveCamera(frame);
  }

  /** The camera on one stop: there by sliding when it is near enough, else at once. */
  function frameStop(stop: RouteStop) {
    const zoom = map.getZoom();
    if (zoom === undefined || zoom < FOCUS_ZOOM) {
      map.moveCamera({ center: stop.location, zoom: FOCUS_ZOOM });
    } else {
      map.panTo(stop.location);
    }
  }

  const focusedStop = () => shown.find((stop) => stop.id === focused);

  return {
    show(stops) {
      clearMarkers();
      shown = stops;
      if (!focusedStop()) focused = null;
      markers = stops.map(
        (stop) =>
          new marker.AdvancedMarkerElement({
            map,
            position: stop.location,
            title: `${stop.number}번 ${stop.name}`,
            content: numberPin(stop.number, stop.id === focused),
            zIndex: zIndexOf(stop, stop.id === focused, stops),
          }),
      );
      line.setPath(stops.map((stop) => stop.location));

      const spots = stops.map(({ location }) => `${location.lat},${location.lng}`).sort().join(' ');
      if (stops.length === 0 || spots === framed) return;
      framed = spots;
      const stop = focusedStop();
      if (stop) frameStop(stop);
      else frameAll();
    },
    focus(id) {
      const next = shown.some((stop) => stop.id === id) ? id : null;
      if (next === focused) return;
      focused = next;
      markers.forEach((pin, index) => {
        const stop = shown[index]!;
        pin.content = numberPin(stop.number, stop.id === focused);
        pin.zIndex = zIndexOf(stop, stop.id === focused, shown);
      });
      const stop = focusedStop();
      if (stop) frameStop(stop);
      else if (shown.length > 0) frameAll();
    },
    destroy() {
      clearMarkers();
      line.setMap(null);
    },
  };
}

/** Later stops over earlier ones, the one up close over all. */
const zIndexOf = (stop: RouteStop, focused: boolean, stops: RouteStop[]) =>
  focused ? stops.length + 1 : stop.number;

function numberPin(number: number, focused: boolean): HTMLElement {
  const pin = document.createElement('div');
  // Moved down by half: markers stand on their spot, these circles are centered on it.
  pin.className = focused
    ? 'flex size-9 translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-brand-600 text-base font-bold text-white shadow-lg ring-4 ring-brand-500/30'
    : 'flex size-7 translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-brand-500 text-sm font-bold text-white shadow-md';
  if (focused) pin.dataset.focused = '';
  pin.textContent = String(number);
  return pin;
}
