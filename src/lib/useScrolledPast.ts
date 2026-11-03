import { useEffect, useState } from 'react';

/**
 * Whether `target` has scrolled up under `header` (a sticky header at the top), e.g. to make a
 * header over a cover solid once the cover is gone. False until both are mounted, and where there
 * is no IntersectionObserver.
 */
export function useScrolledPast(target: Element | null, header: HTMLElement | null): boolean {
  const [past, setPast] = useState(false);

  useEffect(() => {
    if (!target || !header || typeof IntersectionObserver === 'undefined') return;
    const top = header.offsetHeight;
    const observer = new IntersectionObserver(
      ([entry]) => setPast(!entry!.isIntersecting && entry!.boundingClientRect.top < top),
      { rootMargin: `-${top}px 0px 0px 0px` },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [target, header]);

  return past;
}
