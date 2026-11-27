import { describe, expect, it } from 'vitest';
import { DEFAULT_CHECKLIST, defaultChecklistItems } from '@/data/rules/checklist';
import { derivedId } from '@/lib/id';
import { T0 } from '@/test/fixtures';

describe('defaultChecklistItems', () => {
  const trip = '7f1c2a4e-1111-4222-8333-444455556666';

  it('is the default list in order, unchecked and nobody’s', () => {
    const items = defaultChecklistItems(trip, T0);
    expect(items.map((item) => item.text)).toEqual([...DEFAULT_CHECKLIST]);
    expect(items.map((item) => item.order)).toEqual(DEFAULT_CHECKLIST.map((_, i) => i));
    expect(items.every((item) => !item.checked && item.assigneeId === null)).toBe(true);
  });

  it('keeps the ids the first list had, so a trip given it before gets no second copy', () => {
    const byText = new Map(defaultChecklistItems(trip, T0).map((item) => [item.text, item.id]));
    // The first list (2026-11-27): its items by position.
    const first = ['여권', '항공권·예약 확인서', '환전·카드', '충전기', '보조배터리', '멀티 어댑터', '상비약', '세면도구', '옷', '우산'];
    first.forEach((text, i) => {
      expect(byText.get(text)).toBe(derivedId(`checklist:default:${trip}:${i}`));
    });
    expect(new Set(byText.values()).size).toBe(DEFAULT_CHECKLIST.length);
  });
});
