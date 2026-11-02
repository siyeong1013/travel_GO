import { describe, expect, it } from 'vitest';
import { searchForView, viewOf } from '@/features/trips/tripView';

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
});
