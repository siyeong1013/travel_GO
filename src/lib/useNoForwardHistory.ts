import { useEffect, useRef } from 'react';
import { NavigationType, useBlocker, useLocation } from 'react-router';

/** This entry's place in the tab's history, as React Router's browser history numbers them. */
function historyIndex(): number | null {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  return typeof idx === 'number' ? idx : null;
}

/** Whether a back/forward move from entry `from` to entry `to` goes forward. */
export function goesForward(action: NavigationType, from: number | null, to: number | null) {
  return action === NavigationType.Pop && from !== null && to !== null && to > from;
}

/**
 * Keeps history moving one way: back (a swipe from the left edge, the back button) still goes to
 * the previous screen, but forward (a swipe from the right edge on iPhone) would reopen a screen
 * that was left, like a form already saved. Screens open by tapping only.
 */
export function useNoForwardHistory() {
  const location = useLocation();
  const index = useRef<number | null>(null);
  useEffect(() => {
    index.current = historyIndex();
  }, [location]);

  // The browser has already moved to the next entry when this asks; React Router moves it back.
  const blocker = useBlocker(({ historyAction }) =>
    goesForward(historyAction, index.current, historyIndex()),
  );
  useEffect(() => {
    if (blocker.state === 'blocked') blocker.reset();
  }, [blocker]);
}
