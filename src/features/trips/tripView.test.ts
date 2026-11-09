import { describe, expect, it } from 'vitest';
import { editingOf, searchForView, viewOf, withEditing } from '@/features/trips/tripView';

describe('tripView', () => {
  it('reads the view from ?tab=, defaulting to the schedule', () => {
    expect(viewOf(new URLSearchParams('tab=expenses'))).toBe('expenses');
    expect(viewOf(new URLSearchParams('tab=nope'))).toBe('schedule');
    expect(viewOf(new URLSearchParams(''))).toBe('schedule');
  });

  it('switches views keeping the selected day', () => {
    const params = new URLSearchParams('day=2026-11-11');
    expect(searchForView(params, 'expenses')).toBe('?day=2026-11-11&tab=expenses');
    expect(searchForView(new URLSearchParams('day=inbox&tab=expenses'), 'schedule')).toBe(
      '?day=inbox',
    );
    expect(searchForView(new URLSearchParams('tab=expenses'), 'schedule')).toBe('');
  });

  it("keeps the schedule's edit mode in ?edit=1, left on switching views", () => {
    expect(editingOf(new URLSearchParams('day=inbox&edit=1'))).toBe(true);
    expect(editingOf(new URLSearchParams('day=inbox'))).toBe(false);
    expect(editingOf(new URLSearchParams('tab=expenses&edit=1'))).toBe(false);
    expect(withEditing(new URLSearchParams('day=inbox'), true).toString()).toBe('day=inbox&edit=1');
    expect(withEditing(new URLSearchParams('day=inbox&edit=1'), false).toString()).toBe('day=inbox');
    expect(searchForView(new URLSearchParams('day=inbox&edit=1'), 'expenses')).toBe(
      '?day=inbox&tab=expenses',
    );
  });
});
