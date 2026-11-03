/** @vitest-environment happy-dom */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useScrolledPast } from '@/lib/useScrolledPast';

/** IntersectionObserver stand-in that lets the test report where the target is. */
function stubObserver() {
  const seen: { options: IntersectionObserverInit | undefined; report: (entry: object) => void }[] =
    [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        seen.push({
          options,
          report: (entry) => callback([entry as IntersectionObserverEntry], this as never),
        });
      }
      observe() {}
      disconnect() {}
    },
  );
  return seen;
}

describe('useScrolledPast', () => {
  it('is true once the target has gone up under the header, not while it is below', () => {
    const observers = stubObserver();
    const header = document.createElement('header');
    Object.defineProperty(header, 'offsetHeight', { value: 56 });
    const { result } = renderHook(() => useScrolledPast(document.createElement('div'), header));
    expect(result.current).toBe(false);
    expect(observers[0]!.options).toEqual({ rootMargin: '-56px 0px 0px 0px' });

    act(() => observers[0]!.report({ isIntersecting: false, boundingClientRect: { top: 20 } }));
    expect(result.current).toBe(true);
    act(() => observers[0]!.report({ isIntersecting: true, boundingClientRect: { top: 120 } }));
    expect(result.current).toBe(false);
    // Out of sight below the screen is not "scrolled past".
    act(() => observers[0]!.report({ isIntersecting: false, boundingClientRect: { top: 900 } }));
    expect(result.current).toBe(false);
  });

  it('stays false until both are mounted', () => {
    const observers = stubObserver();
    const { result } = renderHook(() => useScrolledPast(null, document.createElement('header')));
    expect(result.current).toBe(false);
    expect(observers).toEqual([]);
  });
});
