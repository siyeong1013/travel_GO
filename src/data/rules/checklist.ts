import type { ChecklistItem, ID, ISODateTime } from '@/data/models';
import { ValidationError } from '@/data/repositories';
import { derivedId } from '@/lib/id';

/** Longest text of a checklist item. */
export const MAX_CHECKLIST_TEXT = 100;

/** Most items a trip's checklist holds. */
export const MAX_CHECKLIST_ITEMS = 300;

/**
 * The default list (in this order): what a new trip starts with, and what "기본 목록으로 시작"
 * puts on an empty checklist. `key` makes the item's id (`defaultChecklistItems`): never change
 * or reuse a key, give a new item the next one (0–9 were the first list, 2026-11-27).
 */
const DEFAULT_ITEMS: readonly { key: number; text: string }[] = [
  { key: 0, text: '여권' },
  { key: 10, text: '신분증' },
  { key: 1, text: '항공권·예약 확인서' },
  { key: 2, text: '환전·카드' },
  { key: 3, text: '충전기' },
  { key: 4, text: '보조배터리' },
  { key: 5, text: '멀티 어댑터' },
  { key: 6, text: '상비약' },
  { key: 7, text: '세면도구' },
  { key: 11, text: '샤워기&필터' },
  { key: 12, text: '스킨로션' },
  { key: 13, text: '선크림' },
  { key: 14, text: '물티슈&티슈' },
  { key: 8, text: '옷' },
  { key: 15, text: '슬리퍼' },
  { key: 9, text: '우산' },
];

export const DEFAULT_CHECKLIST: readonly string[] = DEFAULT_ITEMS.map((item) => item.text);

/** Whether `text` is a checklist item's text as stored: trimmed, 1–100 characters. */
export function isChecklistText(text: unknown): text is string {
  return (
    typeof text === 'string' &&
    text.length > 0 &&
    text.length <= MAX_CHECKLIST_TEXT &&
    text.trim() === text
  );
}

/** `text` trimmed, or a `ValidationError` when empty or too long. */
export function cleanChecklistText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) throw new ValidationError('the item needs a name');
  if (trimmed.length > MAX_CHECKLIST_TEXT) {
    throw new ValidationError(`at most ${MAX_CHECKLIST_TEXT} characters`);
  }
  return trimmed;
}

/** List order: `order`, then `createdAt` (two devices adding at once), then id. */
export function compareChecklistItems(a: ChecklistItem, b: ChecklistItem): number {
  return (
    a.order - b.order ||
    (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * The default list of a trip (`DEFAULT_CHECKLIST`), as a new trip starts with it. Ids come from
 * the trip's (like its "나"), so devices that each add it to the same trip end up with one list.
 */
export function defaultChecklistItems(tripId: ID, timestamp: ISODateTime): ChecklistItem[] {
  return DEFAULT_ITEMS.map(({ key, text }, order) => ({
    id: derivedId(`checklist:default:${tripId}:${key}`),
    tripId,
    text,
    checked: false,
    assigneeId: null,
    order,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}
