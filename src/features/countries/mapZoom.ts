import { type KeyboardEvent, type RefObject, useEffect, useRef, useState } from 'react';

/** A map's size in its own units: what its `viewBox` is at the whole view. */
export interface MapSize {
  width: number;
  height: number;
}

/** What part of a map shows: how far in (1: all of it), and its top left, in the map's units. */
export interface MapView {
  scale: number;
  x: number;
  y: number;
}

/** A point on screen, in px from the top left of the map's box; or of the map, in its units. */
export interface Point {
  x: number;
  y: number;
}

/** The size of the map's box on screen, in px. */
export interface Box {
  width: number;
  height: number;
}

export const WHOLE_MAP: MapView = { scale: 1, x: 0, y: 0 };

/** `view` kept on the map: between all of it and `maxScale` times in, and not past its edges. */
export function keptOnMap(view: MapView, size: MapSize, maxScale: number): MapView {
  const scale = Math.min(Math.max(view.scale, 1), maxScale);
  return {
    scale,
    x: Math.min(Math.max(view.x, 0), size.width - size.width / scale),
    y: Math.min(Math.max(view.y, 0), size.height - size.height / scale),
  };
}

/** The `viewBox` that shows `view`. */
export function viewBoxOf(view: MapView, size: MapSize): string {
  return [view.x, view.y, size.width / view.scale, size.height / view.scale]
    .map((n) => Math.round(n * 100) / 100)
    .join(' ');
}

/**
 * How the whole map sits in its box: px for each of its units, and from where. The map keeps its
 * shape, so in a box of another shape it is in the middle (`preserveAspectRatio`'s default).
 */
export function fitIn(box: Box, size: MapSize): { unit: number; left: number; top: number } {
  const unit = Math.min(box.width / size.width, box.height / size.height);
  return {
    unit,
    left: (box.width - size.width * unit) / 2,
    top: (box.height - size.height * unit) / 2,
  };
}

/** The point of the map at `at` on screen, with `view` showing in `box`. */
export function mapPointAt(view: MapView, size: MapSize, box: Box, at: Point): Point {
  const { unit, left, top } = fitIn(box, size);
  const scale = unit * view.scale;
  return { x: view.x + (at.x - left) / scale, y: view.y + (at.y - top) / scale };
}

/** `view` zoomed `factor` times about `at`, a point of the map that stays where it is on screen. */
export function zoomedAbout(
  view: MapView,
  size: MapSize,
  factor: number,
  at: Point,
  maxScale: number,
): MapView {
  const scale = Math.min(Math.max(view.scale * factor, 1), maxScale);
  const shrink = view.scale / scale;
  return keptOnMap(
    { scale, x: at.x - (at.x - view.x) * shrink, y: at.y - (at.y - view.y) * shrink },
    size,
    maxScale,
  );
}

/** `view` zoomed `factor` times about its middle (the zoom buttons). */
export function zoomed(view: MapView, size: MapSize, factor: number, maxScale: number): MapView {
  const middle = {
    x: view.x + size.width / view.scale / 2,
    y: view.y + size.height / view.scale / 2,
  };
  return zoomedAbout(view, size, factor, middle, maxScale);
}

/** `view` moved a quarter of what shows, `dx` and `dy` (-1, 0 or 1) each way (the arrow keys). */
export function panned(
  view: MapView,
  size: MapSize,
  dx: number,
  dy: number,
  maxScale: number,
): MapView {
  const step = (length: number) => length / view.scale / 4;
  return keptOnMap(
    { ...view, x: view.x + dx * step(size.width), y: view.y + dy * step(size.height) },
    size,
    maxScale,
  );
}

const middleOf = (points: Point[]): Point => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
});
const spreadOf = ([a, b]: Point[]) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0);

/**
 * Where fingers (or a mouse) move the map, from `start` as they went down at `from` to where they
 * are now (`to`, in the same order): the point of the map under their middle stays under it, and
 * two fingers zoom it as much as they spread (or pinch).
 */
export function movedBy(
  start: MapView,
  size: MapSize,
  box: Box,
  from: Point[],
  to: Point[],
  maxScale: number,
): MapView {
  const spread = spreadOf(from) > 0 ? spreadOf(to) / spreadOf(from) : 1;
  const scale = Math.min(Math.max(start.scale * spread, 1), maxScale);
  const held = mapPointAt(start, size, box, middleOf(from));
  const now = middleOf(to);
  const { unit, left, top } = fitIn(box, size);
  const shown = unit * scale;
  return keptOnMap(
    { scale, x: held.x - (now.x - left) / shown, y: held.y - (now.y - top) / shown },
    size,
    maxScale,
  );
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export interface MapZoom {
  view: MapView;
  /** px on screen for each of the map's units at the whole view; 0 until it is on screen. */
  unit: number;
  /** Whether a mouse is moving the map. */
  dragging: boolean;
  zoomIn(): void;
  zoomOut(): void;
  /** Arrow keys move the zoomed in map, + and - zoom it. */
  onKeyDown(event: KeyboardEvent<SVGSVGElement>): void;
}

/**
 * Zooming the map in `svg` up to `maxScale` times and moving it about. Two fingers zoom and move
 * it; one moves it once zoomed in, and scrolls the page at the whole view. A mouse drags it, and
 * zooms it with a touchpad's pinch or the wheel with ctrl (the wheel alone scrolls the page).
 */
export function useMapZoom(
  svg: RefObject<SVGSVGElement | null>,
  { width, height }: MapSize,
  maxScale: number,
): MapZoom {
  const [view, setView] = useState(WHOLE_MAP);
  const [unit, setUnit] = useState(0);
  const [dragging, setDragging] = useState(false);
  // The view as it is now, for events that come faster than the screen draws.
  const current = useRef(WHOLE_MAP);

  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const size = { width, height };
    const boxOf = () => element.getBoundingClientRect();
    const pointOf = ({ clientX, clientY }: { clientX: number; clientY: number }) => {
      const rect = boxOf();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    // Drawn once a frame at most, however many events come.
    let frame = 0;
    const show = (next: MapView) => {
      current.current = next;
      frame ||= requestAnimationFrame(() => {
        frame = 0;
        setView(current.current);
      });
    };

    // Fingers: whenever one goes down or up, the gesture starts again with those down.
    let touch: { start: MapView; ids: number[]; from: Point[] } | null = null;
    const fingersOf = (event: TouchEvent, ids: number[]) =>
      ids
        .map((id) => [...event.touches].find((finger) => finger.identifier === id))
        .filter((finger): finger is Touch => finger !== undefined);
    const restart = (event: TouchEvent) => {
      const fingers = [...event.touches].slice(0, 2);
      const moves = fingers.length === 2 || (fingers.length === 1 && current.current.scale > 1);
      const ids = fingers.map((finger) => finger.identifier);
      touch = moves ? { start: current.current, ids, from: fingers.map(pointOf) } : null;
      // Two fingers are the map's, not the page's to zoom.
      if (fingers.length === 2 && event.cancelable) event.preventDefault();
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!touch) return;
      const fingers = fingersOf(event, touch.ids);
      if (fingers.length !== touch.ids.length) return;
      if (event.cancelable) event.preventDefault();
      show(movedBy(touch.start, size, boxOf(), touch.from, fingers.map(pointOf), maxScale));
    };

    // A mouse drags the zoomed in map.
    let mouse: { start: MapView; from: Point } | null = null;
    const onPointerDown = (event: PointerEvent) => {
      const left = event.pointerType === 'mouse' && event.button === 0;
      if (!left || current.current.scale === 1) return;
      event.preventDefault();
      mouse = { start: current.current, from: pointOf(event) };
      element.setPointerCapture(event.pointerId);
      setDragging(true);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!mouse) return;
      show(movedBy(mouse.start, size, boxOf(), [mouse.from], [pointOf(event)], maxScale));
    };
    const onPointerUp = () => {
      mouse = null;
      setDragging(false);
    };

    // A touchpad's pinch comes as the wheel with ctrl.
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const lines = event.deltaMode === WheelEvent.DOM_DELTA_LINE;
      const delta = lines ? event.deltaY * 33 : event.deltaY;
      const factor = 2 ** Math.min(Math.max(-delta / 100, -1), 1);
      const at = mapPointAt(current.current, size, boxOf(), pointOf(event));
      show(zoomedAbout(current.current, size, factor, at, maxScale));
    };

    const resized =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => setUnit(fitIn(boxOf(), size).unit));
    resized?.observe(element);
    const touchOptions = { passive: false };
    element.addEventListener('touchstart', restart, touchOptions);
    element.addEventListener('touchmove', onTouchMove, touchOptions);
    element.addEventListener('touchend', restart);
    element.addEventListener('touchcancel', restart);
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointercancel', onPointerUp);
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      cancelAnimationFrame(frame);
      resized?.disconnect();
      element.removeEventListener('touchstart', restart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', restart);
      element.removeEventListener('touchcancel', restart);
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointercancel', onPointerUp);
      element.removeEventListener('wheel', onWheel);
    };
  }, [svg, width, height, maxScale]);

  const change = (next: (view: MapView) => MapView) => {
    current.current = next(current.current);
    setView(current.current);
  };
  const size = { width, height };
  return {
    view,
    unit,
    dragging,
    zoomIn: () => change((now) => zoomed(now, size, 2, maxScale)),
    zoomOut: () => change((now) => zoomed(now, size, 1 / 2, maxScale)),
    onKeyDown(event) {
      const arrow = ARROWS[event.key];
      if (event.key === '+' || event.key === '=') change((now) => zoomed(now, size, 2, maxScale));
      else if (event.key === '-') change((now) => zoomed(now, size, 1 / 2, maxScale));
      else if (arrow) change((now) => panned(now, size, arrow[0], arrow[1], maxScale));
      else return;
      event.preventDefault();
    },
  };
}
