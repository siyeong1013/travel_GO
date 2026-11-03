import { Link, useLocation, useSearchParams } from 'react-router';
import { searchForView, type TripView } from '@/features/trips/tripView';

const VIEWS: { key: TripView; label: string }[] = [
  { key: 'schedule', label: '일정' },
  { key: 'expenses', label: '가계부' },
];

/**
 * Schedule / ledger switch. Links that replace the history entry (like the day tabs), so
 * "back" leaves the trip instead of flipping between them.
 */
export function TripViewTabs({ view }: { view: TripView }) {
  const { pathname } = useLocation();
  const [params] = useSearchParams();

  return (
    <nav aria-label="여행 화면" className="flex border-b border-gray-100 px-2">
      {VIEWS.map(({ key, label }) => (
        <Link
          key={key}
          to={{ pathname, search: searchForView(params, key) }}
          replace
          aria-current={view === key ? 'page' : undefined}
          className={`relative flex h-12 flex-1 items-center justify-center text-base font-bold transition-colors ${
            view === key ? 'text-gray-900' : 'text-gray-400 active:text-gray-600'
          }`}
        >
          {label}
          {view === key && (
            <span aria-hidden="true" className="absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-gray-900" />
          )}
        </Link>
      ))}
    </nav>
  );
}
