/** The two halves of the trip detail page. */
export type TripView = 'schedule' | 'expenses';

/** `?tab=expenses` opens the ledger; anything else, the schedule. */
export function viewOf(params: URLSearchParams): TripView {
  return params.get('tab') === 'expenses' ? 'expenses' : 'schedule';
}

/** `params` switched to `view`, keeping the others (e.g. `?day=`). */
export function searchForView(params: URLSearchParams, view: TripView): string {
  const next = new URLSearchParams(params);
  if (view === 'schedule') next.delete('tab');
  else next.set('tab', view);
  const search = next.toString();
  return search ? `?${search}` : '';
}
