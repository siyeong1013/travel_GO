/** The two halves of the trip detail page. */
export type TripView = 'schedule' | 'expenses';

/** `?tab=expenses` opens the ledger; anything else, the schedule. */
export function viewOf(params: URLSearchParams): TripView {
  return params.get('tab') === 'expenses' ? 'expenses' : 'schedule';
}

/** `params` switched to `view`, keeping the others (e.g. `?day=`) but the schedule's edit mode. */
export function searchForView(params: URLSearchParams, view: TripView): string {
  const next = new URLSearchParams(params);
  next.delete('edit');
  if (view === 'schedule') next.delete('tab');
  else next.set('tab', view);
  const search = next.toString();
  return search ? `?${search}` : '';
}

/** Whether the schedule is in its edit mode (`?edit=1`): items picked, reordered, deleted. */
export function editingOf(params: URLSearchParams): boolean {
  return viewOf(params) === 'schedule' && params.get('edit') === '1';
}

/** `params` with the schedule's edit mode on or off. */
export function withEditing(params: URLSearchParams, editing: boolean): URLSearchParams {
  const next = new URLSearchParams(params);
  if (editing) next.set('edit', '1');
  else next.delete('edit');
  return next;
}
