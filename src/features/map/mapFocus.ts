import { type RefObject, useEffect, useState } from 'react';
import type { ID } from '@/data/models';

/** Where the day's list is on screen (px from the top of the window), for `focusedStop`. */
export interface ListLayout {
  /** Whether the map is pinned at the top: the page has scrolled the list up to it. */
  pinned: boolean;
  /** Where the list shows: below the pinned map, above the action bar. */
  top: number;
  bottom: number;
  /** The day's cards in order: where they are, and whether the map has their place. */
  cards: { id: ID; top: number; bottom: number; onMap: boolean }[];
}

/**
 * The place the map shows up close as the list scrolls under it: none until the map is pinned
 * (the whole route then), nor when the whole list shows at once. A line goes down the list's
 * window as far as the list has scrolled (at its top when the first card comes up to the map, at
 * its bottom when the last one comes into view), so every card has its turn, in order. The place
 * is the last on the map whose card has reached the line (the first one, before any has).
 */
export function focusedStop({ pinned, top, bottom, cards }: ListLayout): ID | null {
  const onMap = cards.filter((card) => card.onMap);
  const first = cards[0];
  const last = cards.at(-1);
  if (!pinned || !first || !last || onMap.length === 0) return null;
  // How far the list scrolls under the map, from its first card at the top to its last in view.
  const range = last.bottom - first.top - (bottom - top);
  if (range <= 0) return null;
  const scrolled = Math.min(Math.max((top - first.top) / range, 0), 1);
  const line = top + scrolled * (bottom - top);
  let focus = onMap[0]!.id;
  for (const card of onMap) if (card.top <= line) focus = card.id;
  return focus;
}

interface MapFocusElements {
  /** What holds the map, pinned at the top (`position: sticky`) once the page scrolls to it. */
  pinned: RefObject<HTMLElement | null>;
  /** What holds the day's cards, each marked with `data-item-id`. */
  list: RefObject<HTMLElement | null>;
  /** The action bar at the bottom of the screen. */
  bar: RefObject<HTMLElement | null>;
}

/** `focusedStop` as the page scrolls, for the places on the map (`stopIds`: none, none up close). */
export function useMapFocus({ pinned, list, bar }: MapFocusElements, stopIds: ID[]): ID | null {
  const [focus, setFocus] = useState<ID | null>(null);
  const key = stopIds.join(' ');

  useEffect(() => {
    if (!key) return;
    const onMap = new Set(key.split(' '));
    let frame = 0;
    function measure() {
      frame = 0;
      const block = pinned.current;
      const cards = list.current;
      if (!block || !cards) return;
      const { top, bottom } = block.getBoundingClientRect();
      const pinnedAt = Number.parseFloat(getComputedStyle(block).top) || 0;
      setFocus(
        focusedStop({
          pinned: top <= pinnedAt + 0.5,
          top: bottom,
          bottom: bar.current?.getBoundingClientRect().top ?? window.innerHeight,
          cards: [...cards.querySelectorAll<HTMLElement>('[data-item-id]')].map((card) => {
            const rect = card.getBoundingClientRect();
            const id = card.dataset.itemId!;
            return { id, top: rect.top, bottom: rect.bottom, onMap: onMap.has(id) };
          }),
        }),
      );
    }
    // Once a frame at most, however many scroll events come.
    const update = () => {
      frame ||= requestAnimationFrame(measure);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    // Cards come, go and change size without a scroll.
    const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    if (list.current) resized?.observe(list.current);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      resized?.disconnect();
    };
  }, [key, pinned, list, bar]);

  return key ? focus : null;
}
