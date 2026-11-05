import { useEffect, useRef } from 'react';
import {
  NavigationType,
  useBlocker,
  useLocation,
  useNavigate,
  useNavigationType,
  type Location,
  type NavigateFunction,
} from 'react-router';
import { isIos, isStandalone } from '@/lib/platform';

// On iPhone a swipe from the right edge goes to the entry ahead whenever there is one: it is
// WebKit's own gesture, which the page can't stop (CSS and touch events don't reach it). Entries
// can't be removed either, only cut off by adding a new one. So after going back the app leaves
// nothing ahead, or only a copy of the screen shown (`aheadPlan`).

interface EntryState {
  idx?: unknown;
}

/** This entry's place in the tab's history, as React Router's browser history numbers them. */
function historyIndex(): number | null {
  const idx = (window.history.state as EntryState | null)?.idx;
  return typeof idx === 'number' ? idx : null;
}

/** Whether a back/forward move from entry `from` to entry `to` goes forward. */
export function goesForward(action: NavigationType, from: number | null, to: number | null) {
  return action === NavigationType.Pop && from !== null && to !== null && to > from;
}

/** Whether a back/forward move from entry `from` to entry `to` goes back. */
export function goesBack(action: NavigationType, from: number | null, to: number | null) {
  return action === NavigationType.Pop && from !== null && to !== null && to < from;
}

/**
 * What to leave ahead of an entry gone back to.
 * - `copy`: a copy of this screen (added, then stepped back from). Going back is as before; going
 *   forward shows this same screen, and the blocker below takes it back.
 * - `listOnTop`: the trip list at the start of an iPhone home screen app's history gets a copy of
 *   itself on top and stays there, with nothing ahead. Going back from it shows the list again.
 * - `listOnTopAgain`: the list on top of that first entry: put on top of it again.
 *
 * The list only so in a home screen app: in a browser tab going back from it leaves for the pages
 * before, and on Android it closes the app, which the copy below would stop. And only from the
 * start of history: WebKit takes an entry that a script added over 10 s after the last tap for a
 * redirect, and going back from it skips the entry before it, unless that is the first one.
 */
export type AheadPlan = 'copy' | 'listOnTop' | 'listOnTopAgain';

export function aheadPlan(pathname: string, index: number, startsAtList: boolean): AheadPlan {
  if (startsAtList && pathname === '/') {
    if (index === 0) return 'listOnTop';
    if (index === 1) return 'listOnTopAgain';
  }
  return 'copy';
}

/** An iPhone home screen app opened anew: its history starts here, at the trip list. */
const startsAtList =
  typeof window !== 'undefined' &&
  window.history.length === 1 &&
  window.location.pathname === '/' &&
  isIos() &&
  isStandalone();

/** The app's own steps through history whose popstate events are still to come. */
let ownSteps = 0;
let stepDone: (() => void) | null = null;

/**
 * Keeps the app's own steps through history from the router, which would show the screen stepped
 * to. Call before the router starts listening (router.tsx), so this hears popstate first.
 */
export function watchOwnHistorySteps() {
  window.addEventListener(
    'popstate',
    (event) => {
      if (ownSteps === 0) return;
      ownSteps -= 1;
      event.stopImmediatePropagation();
      stepDone?.();
    },
    true,
  );
}

/** Steps through history without the router seeing it; false if the step never came. */
function stepUnseen(delta: number): Promise<boolean> {
  return new Promise((resolve) => {
    const giveUp = window.setTimeout(() => {
      ownSteps = 0;
      stepDone = null;
      resolve(false);
    }, 1000);
    ownSteps += 1;
    stepDone = () => {
      window.clearTimeout(giveUp);
      stepDone = null;
      resolve(true);
    };
    window.history.go(delta);
  });
}

/** A key for a history entry, as React Router makes them. */
function newKey() {
  return Math.random().toString(36).slice(2, 10);
}

let leaving = false;

async function leaveNothingAhead(plan: AheadPlan, location: Location, navigate: NavigateFunction) {
  if (leaving || document.visibilityState !== 'visible') return;
  // Chrome skips the entries of a page that adds them before it is ever tapped.
  if (navigator.userActivation?.hasBeenActive === false) return;
  leaving = true;
  const { history } = window;
  try {
    if (plan === 'copy') {
      const state = history.state as Record<string, unknown> | null;
      const index = historyIndex();
      if (!state || index === null) return;
      // Neither step moves the page (the copy takes this entry's setting, then it is put back).
      const restoration = history.scrollRestoration;
      history.scrollRestoration = 'manual';
      history.pushState({ ...state, key: newKey(), idx: index + 1 }, '', window.location.href);
      await stepUnseen(-1);
      history.scrollRestoration = restoration;
      return;
    }
    if (plan === 'listOnTopAgain' && !(await stepUnseen(-1))) return;
    // Through the router, which then knows where it is. The list at the start never moves the
    // page when stepped to; the one on top does as before.
    history.scrollRestoration = 'manual';
    const { pathname, search, hash, state } = location;
    await navigate({ pathname, search, hash }, { state });
    history.scrollRestoration = 'auto';
  } finally {
    leaving = false;
  }
}

/** Time for a swipe back to finish drawing before the entries ahead change. */
const SETTLE_MS = 600;

/**
 * Keeps history moving one way: back (a swipe from the left edge, the back button) still goes to
 * the previous screen, but forward would reopen a screen that was left, like a form already saved.
 * Screens open by tapping only.
 */
export function useNoForwardHistory() {
  const location = useLocation();
  const action = useNavigationType();
  const navigate = useNavigate();
  // The entry shown and whether it was gone back to (per entry: StrictMode runs effects twice).
  const shown = useRef<{ key: string; index: number | null; back: boolean } | null>(null);

  useEffect(() => {
    if (shown.current?.key !== location.key) {
      const index = historyIndex();
      const back = goesBack(action, shown.current?.index ?? null, index);
      shown.current = { key: location.key, index, back };
    }
    const { index, back } = shown.current;
    if (!back || index === null) return;
    const plan = aheadPlan(location.pathname, index, startsAtList);
    const timer = window.setTimeout(() => {
      void leaveNothingAhead(plan, location, navigate);
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [location, action, navigate]);

  // Whatever is still ahead (before that, or the copy): the browser has already moved to it when
  // this asks, and React Router moves it back.
  const blocker = useBlocker(({ historyAction }) =>
    goesForward(historyAction, shown.current?.index ?? null, historyIndex()),
  );
  useEffect(() => {
    if (blocker.state === 'blocked') blocker.reset();
  }, [blocker]);
}
