import type { ChecklistItem } from '@/data/models';

/** How many items are checked, of all. */
export function checklistProgress(items: Pick<ChecklistItem, 'checked'>[]): {
  done: number;
  total: number;
} {
  return { done: items.filter((item) => item.checked).length, total: items.length };
}

/** What was typed into "준비물 추가": comma- or line-separated, trimmed, the empty ones left out. */
export function splitChecklistInput(text: string): string[] {
  return text
    .split(/[,，\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}
