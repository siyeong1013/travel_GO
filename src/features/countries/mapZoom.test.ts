import { describe, expect, it } from 'vitest';
import {
  keptOnMap,
  mapPointAt,
  movedBy,
  panned,
  viewBoxOf,
  WHOLE_MAP,
  zoomed,
  zoomedAbout,
} from '@/features/countries/mapZoom';

// A map 1000 by 500 units, on screen 500 by 250 px: half a px a unit at the whole view.
const size = { width: 1000, height: 500 };
const box = { width: 500, height: 250 };
/** Twice in, on the map's middle. */
const middle = { scale: 2, x: 250, y: 125 };

describe('viewBoxOf', () => {
  it('is what shows of the map, in its units', () => {
    expect(viewBoxOf(WHOLE_MAP, size)).toBe('0 0 1000 500');
    expect(viewBoxOf({ scale: 4, x: 250, y: 125 }, size)).toBe('250 125 250 125');
    expect(viewBoxOf({ scale: 3, x: 0, y: 0 }, size)).toBe('0 0 333.33 166.67');
  });
});

describe('keptOnMap', () => {
  it('zooms between all of the map and the most, and not past its edges', () => {
    const far = keptOnMap({ scale: 20, x: -5, y: 900 }, size, 16);
    expect(far).toEqual({ scale: 16, x: 0, y: 468.75 });
    expect(keptOnMap({ scale: 0.5, x: 10, y: 10 }, size, 16)).toEqual(WHOLE_MAP);
  });
});

describe('zoomed', () => {
  it('zooms about the middle of what shows', () => {
    expect(zoomed(WHOLE_MAP, size, 2, 16)).toEqual(middle);
    expect(zoomed(middle, size, 2, 16)).toEqual({ scale: 4, x: 375, y: 187.5 });
    expect(zoomed(middle, size, 1 / 2, 16)).toEqual(WHOLE_MAP);
  });

  it('stays on the map zooming out from a corner, and stops at the most', () => {
    const corner = { scale: 4, x: 750, y: 375 };
    expect(zoomed(corner, size, 1 / 2, 16)).toEqual({ scale: 2, x: 500, y: 250 });
    expect(zoomed({ scale: 16, x: 0, y: 0 }, size, 2, 16).scale).toBe(16);
  });
});

describe('zoomedAbout', () => {
  it('keeps the point where it is on screen', () => {
    const at = mapPointAt(WHOLE_MAP, size, box, { x: 400, y: 50 });
    expect(at).toEqual({ x: 800, y: 100 });
    const view = zoomedAbout(WHOLE_MAP, size, 4, at, 16);
    expect(view).toEqual({ scale: 4, x: 600, y: 75 });
    expect(mapPointAt(view, size, box, { x: 400, y: 50 })).toEqual(at);
  });
});

describe('mapPointAt', () => {
  it('takes the map in the middle of a box of another shape', () => {
    // A box taller than the map: half a px a unit still, the map 75px down.
    expect(mapPointAt(WHOLE_MAP, size, { width: 500, height: 400 }, { x: 250, y: 200 })).toEqual({
      x: 500,
      y: 250,
    });
    const tall = { width: 500, height: 400 };
    expect(mapPointAt(middle, size, tall, { x: 0, y: 75 })).toEqual({ x: 250, y: 125 });
  });
});

describe('movedBy', () => {
  it('drags the map along with one finger', () => {
    // 50px right, 20px up: twice in, a px is a unit.
    expect(movedBy(middle, size, box, [{ x: 100, y: 100 }], [{ x: 150, y: 80 }], 16)).toEqual({
      scale: 2,
      x: 200,
      y: 145,
    });
  });

  it('zooms as two fingers spread, about their middle, and moves with it', () => {
    const from = [
      { x: 200, y: 100 },
      { x: 300, y: 100 },
    ];
    const spread = [
      { x: 150, y: 100 },
      { x: 350, y: 100 },
    ];
    const view = movedBy(WHOLE_MAP, size, box, from, spread, 16);
    expect(view).toEqual({ scale: 2, x: 250, y: 100 });
    // The point that was under their middle still is.
    expect(mapPointAt(view, size, box, { x: 250, y: 100 })).toEqual({ x: 500, y: 200 });
    // Spread and moved 50px left: the map comes along.
    const moved = spread.map(({ x, y }) => ({ x: x - 50, y }));
    expect(movedBy(WHOLE_MAP, size, box, from, moved, 16)).toEqual({ scale: 2, x: 300, y: 100 });
  });

  it('stops at all of the map pinching in, and at the most spreading out', () => {
    const from = [
      { x: 150, y: 100 },
      { x: 350, y: 100 },
    ];
    const pinched = [
      { x: 240, y: 100 },
      { x: 260, y: 100 },
    ];
    expect(movedBy(middle, size, box, from, pinched, 16)).toEqual(WHOLE_MAP);
    expect(movedBy(middle, size, box, pinched, from, 16).scale).toBe(16);
  });

  it('only moves the map for fingers that went down on the same spot', () => {
    const from = [
      { x: 100, y: 100 },
      { x: 100, y: 100 },
    ];
    const to = [
      { x: 110, y: 100 },
      { x: 130, y: 100 },
    ];
    expect(movedBy(middle, size, box, from, to, 16)).toEqual({ scale: 2, x: 230, y: 125 });
  });
});

describe('panned', () => {
  it('moves a quarter of what shows, not past the edges', () => {
    expect(panned(middle, size, 1, 0, 16)).toEqual({ scale: 2, x: 375, y: 125 });
    expect(panned(middle, size, 0, -1, 16)).toEqual({ scale: 2, x: 250, y: 62.5 });
    expect(panned({ scale: 2, x: 500, y: 0 }, size, 1, -1, 16)).toEqual({ scale: 2, x: 500, y: 0 });
  });
});
