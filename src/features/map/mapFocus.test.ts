import { describe, expect, it } from 'vitest';
import { focusedStop, type ListLayout } from '@/features/map/mapFocus';

/** Cards 100px tall one under the other, from `firstTop`; those named in `off` aren't on the map. */
function cards(firstTop: number, count: number, off: string[] = []): ListLayout['cards'] {
  return Array.from({ length: count }, (_, i) => {
    const id = String(i + 1);
    const top = firstTop + i * 100;
    return { id, top, bottom: top + 100, onMap: !off.includes(id) };
  });
}

// The list shows between the pinned map (its bottom at 300) and the action bar (at 700).
const view = { top: 300, bottom: 700 };
/** Eight cards, `scrolled` px up from where the first one comes up to the map (16px under it). */
const eight = (scrolled: number, off: string[] = []) =>
  focusedStop({ ...view, pinned: true, cards: cards(316 - scrolled, 8, off) });
/** Every place it goes to, in order, scrolling to the end in steps of 10px. */
const goesThrough = (off: string[] = []) => [
  ...new Set(Array.from({ length: 43 }, (_, i) => eight(i * 10, off))),
];

describe('focusedStop', () => {
  it('is none until the map is pinned: the whole route', () => {
    expect(focusedStop({ ...view, pinned: false, cards: cards(316, 8) })).toBeNull();
  });

  it('is none when the whole list shows at once', () => {
    expect(focusedStop({ ...view, pinned: true, cards: cards(316, 3) })).toBeNull();
  });

  it('goes down the list as it scrolls, every card in turn, the last at the end', () => {
    // The first card just come up to the map.
    expect(eight(0)).toBe('1');
    // Halfway: the line is halfway down the list's window.
    expect(eight(216)).toBe('5');
    // At the end, the last card in view.
    expect(eight(416)).toBe('8');
    expect(goesThrough()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
  });

  it('stays on the last place on the map while cards without one go by', () => {
    // A flight and a plan without a place in the middle.
    expect(goesThrough(['3', '4'])).toEqual(['1', '2', '5', '6', '7', '8']);
    // Only the last card on the map: it, from the start.
    expect(eight(0, ['1', '2', '3', '4', '5', '6', '7'])).toBe('8');
    expect(eight(0, ['1', '2', '3', '4', '5', '6', '7', '8'])).toBeNull();
    expect(focusedStop({ ...view, pinned: true, cards: [] })).toBeNull();
  });
});
