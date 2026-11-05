import { NavigationType } from 'react-router';
import { describe, expect, it } from 'vitest';
import { aheadPlan, goesBack, goesForward } from '@/lib/useNoForwardHistory';

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

describe('goesBack', () => {
  it('is a back/forward move to an earlier entry', () => {
    expect(goesBack(NavigationType.Pop, 3, 2)).toBe(true);
    expect(goesBack(NavigationType.Pop, 2, 0)).toBe(true);
  });

  it('is not going forward, a tap or an unnumbered entry', () => {
    expect(goesBack(NavigationType.Pop, 2, 3)).toBe(false);
    expect(goesBack(NavigationType.Push, 3, 2)).toBe(false);
    expect(goesBack(NavigationType.Pop, null, 2)).toBe(false);
    expect(goesBack(NavigationType.Pop, 3, null)).toBe(false);
  });
});

describe('aheadPlan', () => {
  it('leaves a copy of the screen ahead', () => {
    expect(aheadPlan('/trips/a', 2, true)).toBe('copy');
    expect(aheadPlan('/trips/a', 0, false)).toBe('copy');
  });

  it('puts the trip list on top of itself in a home screen app started there', () => {
    expect(aheadPlan('/', 0, true)).toBe('listOnTop');
    expect(aheadPlan('/', 1, true)).toBe('listOnTopAgain');
  });

  it('leaves a copy ahead of the list elsewhere', () => {
    // A browser tab, Android, or a history that started somewhere else (going back must leave).
    expect(aheadPlan('/', 0, false)).toBe('copy');
    expect(aheadPlan('/', 1, false)).toBe('copy');
    // Higher up the list has other screens below it.
    expect(aheadPlan('/', 3, true)).toBe('copy');
  });
});
