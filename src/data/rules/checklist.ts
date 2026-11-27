import type { ChecklistItem, ID, ISODateTime } from '@/data/models';
import { ValidationError } from '@/data/repositories';
import { derivedId } from '@/lib/id';

/** Longest text of a checklist item. */
export const MAX_CHECKLIST_TEXT = 100;

/** Most items a trip's checklist holds. */
export const MAX_CHECKLIST_ITEMS = 300;

/** What "기본 목록으로 시작" puts on an empty checklist, in this order. */
export const DEFAULT_CHECKLIST: readonly string[] = [
  '여권',
  '항공권·예약 확인',
  '환전·카드',
  '충전기',
  '보조배터리',
  '멀티 어댑터',
  '상비약',
  '세면도구',
  '옷',
  '우산',
];

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
  return DEFAULT_CHECKLIST.map((text, order) => ({
    id: derivedId(`checklist:default:${tripId}:${order}`),
    tripId,
    text,
    checked: false,
    assigneeId: null,
    order,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}
