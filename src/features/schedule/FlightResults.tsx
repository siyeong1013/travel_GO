import { Button } from '@/components/ui/Button';
import type { FlightLookup } from '@/features/schedule/flightLookup';
import { airportName, arrivalText } from '@/features/schedule/flightItem';
import type { FlightLeg } from '@/lib/flights';

/** Where a flight lookup stands: asked for `number`, and its answer once it came. */
export interface FlightSearch {
  number: string;
  result: FlightLookup | null;
}

const MESSAGES: Record<Exclude<FlightLookup['status'], 'ok'>, string> = {
  notFound: '이 날짜에 출발하는 항공편을 찾지 못했어요. 편명과 날짜를 확인해 주세요.',
  invalid: '편명을 확인해 주세요. 예: KE723',
  signedOut: '로그인하면 항공편 정보를 불러올 수 있어요.',
  unavailable: '지금은 항공편 정보를 불러올 수 없어요.',
  busy: '이번 달 항공편 조회를 다 썼거나 잠시 붐벼요. 나중에 다시 시도해 주세요.',
  error: '항공편 정보를 불러오지 못했어요.',
  offline: '인터넷에 연결되면 항공편 정보를 불러올 수 있어요.',
};

interface FlightResultsProps {
  search: FlightSearch;
  /** Number of the leg being added. */
  adding: string | null;
  disabled: boolean;
  onAdd: (leg: FlightLeg) => void;
  onRetry: () => void;
}

/**
 * A flight number's legs on the day (usually one), each added with a tap; or why there are none.
 * AeroDataBox's free plan asks for its name, linked, wherever its data shows.
 */
export function FlightResults({ search, adding, disabled, onAdd, onRetry }: FlightResultsProps) {
  const { result } = search;
  if (!result) {
    return <p className="px-3 py-2 text-sm text-gray-500">{search.number} 항공편을 찾고 있어요.</p>;
  }
  if (result.status !== 'ok') {
    return (
      <div className="flex flex-col items-start gap-2 px-3 py-2">
        <p role="alert" className="text-sm break-keep text-gray-600">
          {MESSAGES[result.status]}
        </p>
        {(result.status === 'error' || result.status === 'offline') && (
          <Button variant="secondary" onClick={onRetry}>
            다시 시도
          </Button>
        )}
      </div>
    );
  }
  return (
    <div>
      <ul className="flex flex-col">
        {result.flights.map((leg) => {
          const arrival = arrivalText(leg);
          return (
            <li key={`${leg.number} ${leg.departure.iata} ${leg.departure.time}`}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAdd(leg)}
                className="flex min-h-14 w-full flex-col items-start rounded-2xl px-3 py-2.5 text-left active:bg-gray-50 disabled:opacity-50"
              >
                <span className="font-semibold">
                  {leg.number}
                  {leg.airline && <span className="font-normal text-gray-500"> · {leg.airline}</span>}
                </span>
                <span className="text-sm text-gray-600">
                  {airportName(leg.departure)} {leg.departure.time ?? ''} → {airportName(leg.arrival)}{' '}
                  {arrival}
                </span>
                <span className="text-sm font-semibold text-brand-600">
                  {adding === leg.number ? '추가하고 있어요' : '이 항공편 추가'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="px-3 pt-1 text-xs text-gray-400">
        항공편 정보:{' '}
        {/* Their terms: a working link that keeps the referrer (no `noreferrer`). */}
        <a href="https://aerodatabox.com" target="_blank" rel="noopener" className="underline">
          AeroDataBox
        </a>
      </p>
    </div>
  );
}
