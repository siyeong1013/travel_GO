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
    <nav aria-label="여행 화면" className="px-4 pt-3 pb-1">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1">
        {VIEWS.map(({ key, label }) => (
          <Link
            key={key}
            to={{ pathname, search: searchForView(params, key) }}
            replace
            aria-current={view === key ? 'page' : undefined}
            className={`flex h-11 items-center justify-center rounded-lg text-[15px] font-semibold transition-colors ${
              view === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 active:text-gray-700'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
