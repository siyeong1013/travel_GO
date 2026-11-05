import { NavigationType } from 'react-router';
import { describe, expect, it } from 'vitest';
import { goesForward } from '@/lib/useNoForwardHistory';

describe('goesForward', () => {
  it('is a back/forward move to a later entry', () => {
    expect(goesForward(NavigationType.Pop, 2, 3)).toBe(true);
    expect(goesForward(NavigationType.Pop, 0, 2)).toBe(true);
  });

  it('lets going back, taps and unnumbered entries through', () => {
    expect(goesForward(NavigationType.Pop, 3, 2)).toBe(false);
    expect(goesForward(NavigationType.Push, 2, 3)).toBe(false);
    expect(goesForward(NavigationType.Replace, 2, 2)).toBe(false);
    expect(goesForward(NavigationType.Pop, null, 3)).toBe(false);
    expect(goesForward(NavigationType.Pop, 2, null)).toBe(false);
  });
});
