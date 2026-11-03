import { describe, expect, it } from 'vitest';
import { centerSquare, fitWithin } from '@/lib/image';

describe('fitWithin', () => {
  it('shrinks the long side to the limit, keeping the shape', () => {
    expect(fitWithin({ width: 4032, height: 3024 }, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin({ width: 3024, height: 4032 }, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin({ width: 4000, height: 2251 }, 1600)).toEqual({ width: 1600, height: 900 });
  });

  it('never makes an image larger, or thinner than a pixel', () => {
    expect(fitWithin({ width: 800, height: 600 }, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin({ width: 10_000, height: 2 }, 1600)).toEqual({ width: 1600, height: 1 });
  });
});

describe('centerSquare', () => {
  it('takes the middle of a wide or tall image', () => {
    expect(centerSquare({ width: 1600, height: 1200 })).toEqual({ x: 200, y: 0, width: 1200, height: 1200 });
    expect(centerSquare({ width: 1200, height: 1601 })).toEqual({ x: 0, y: 200, width: 1200, height: 1200 });
    expect(centerSquare({ width: 500, height: 500 })).toEqual({ x: 0, y: 0, width: 500, height: 500 });
  });
});
