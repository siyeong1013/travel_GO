import { type MouseEvent, type PointerEvent, type TouchEvent, useEffect, useRef } from 'react';

/** ms a finger stays down to press long: a bit under the browsers' own (Android's menu, 500ms). */
export const LONG_PRESS_MS = 450;
/** px it may move meanwhile; more is a scroll. */
const SLOP = 10;
/** ms after the finger is up that a click still ends the long press. */
const CLICK_AFTER_MS = 600;
/** What tells us the finger is up again, whichever the browser sends. */
const UP_EVENTS = ['touchend', 'touchcancel', 'pointerup', 'pointercancel'] as const;

/**
 * A finger (or a pen) held still on an element: `onLongPress`, not a tap. Not a mouse: it has no
 * long press. The handlers go on the element. A browser may still send a click when the finger
 * comes up, on whatever is there by then: `endsLongPress` says to ignore it.
 *
 * A finger is followed by touch events, not pointer ones: iOS Safari sends `pointercancel` as
 * soon as the page could scroll, even with the finger still, which would cancel every press.
 * Touch events keep reporting where the finger is, so a real move is what cancels.
 */
export function useLongPress(onLongPress: () => void) {
  const press = useRef<{ x: number; y: number; timer: number } | null>(null);
  /** When the last long press's finger came up: Infinity while it is down, -Infinity before any. */
  const upAt = useRef(-Infinity);
  const latest = useRef(onLongPress);
  useEffect(() => {
    latest.current = onLongPress;
  });

  function cancel() {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  }
  useEffect(() => {
    const pressing = press;
    return () => {
      if (pressing.current) window.clearTimeout(pressing.current.timer);
    };
  }, []);

  function start(x: number, y: number) {
    cancel();
    press.current = { x, y, timer: window.setTimeout(pressLong, LONG_PRESS_MS) };
  }
  function movedTo(x: number, y: number) {
    const from = press.current;
    if (from && Math.hypot(x - from.x, y - from.y) > SLOP) cancel();
  }

  function pressLong() {
    cancel();
    upAt.current = Infinity;
    const up = () => {
      upAt.current = performance.now();
      for (const type of UP_EVENTS) window.removeEventListener(type, up);
    };
    for (const type of UP_EVENTS) window.addEventListener(type, up);
    navigator.vibrate?.(10);
    latest.current();
  }

  return {
    handlers: {
      onTouchStart(event: TouchEvent<HTMLElement>) {
        const touch = event.touches[0];
        // A second finger is a gesture of the page's, not a press.
        if (event.touches.length !== 1 || !touch) return cancel();
        start(touch.clientX, touch.clientY);
      },
      onTouchMove(event: TouchEvent<HTMLElement>) {
        const touch = event.touches[0];
        if (event.touches.length !== 1 || !touch) return cancel();
        movedTo(touch.clientX, touch.clientY);
      },
      onTouchEnd: cancel,
      onTouchCancel: cancel,
      // A pen has no touch events of its own; a mouse has no long press.
      onPointerDown(event: PointerEvent<HTMLElement>) {
        if (event.pointerType !== 'pen' || !event.isPrimary) return;
        start(event.clientX, event.clientY);
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        if (event.pointerType === 'pen') movedTo(event.clientX, event.clientY);
      },
      onPointerUp(event: PointerEvent<HTMLElement>) {
        if (event.pointerType === 'pen') cancel();
      },
      onPointerCancel(event: PointerEvent<HTMLElement>) {
        if (event.pointerType === 'pen') cancel();
      },
      // Android opens a menu on a long press: this one is the app's.
      onContextMenu(event: MouseEvent<HTMLElement>) {
        if (!press.current && upAt.current !== Infinity) return;
        event.preventDefault();
        if (press.current) pressLong();
      },
    },
    /** Whether a click now is the end of a long press. */
    endsLongPress: () => performance.now() - upAt.current < CLICK_AFTER_MS,
  };
}
