import { Button } from '@/components/ui/Button';
import { FLIGHT_MESSAGES, type FlightLookup } from '@/features/schedule/flightLookup';
import { airportName, arrivalText } from '@/features/schedule/flightItem';
import type { FlightLeg } from '@/lib/flights';

/** Where a flight lookup stands: asked for `number`, and its answer once it came. */
export interface FlightSearch {
  number: string;
  result: FlightLookup | null;
}

interface FlightResultsProps {
  search: FlightSearch;
  /** Number of the leg being added. */
  adding: string | null;
  disabled: boolean;
  /** What tapping a leg does. */
  pickLabel?: string;
  onPick: (leg: FlightLeg) => void;
  onRetry: () => void;
}

/**
 * A flight number's legs on the day (usually one), each picked with a tap (added, by default); or
 * why there are none. AeroDataBox's free plan asks for its name, linked, wherever its data shows.
 */
export function FlightResults({
  search,
  adding,
  disabled,
  pickLabel = '이 항공편 추가',
  onPick,
  onRetry,
}: FlightResultsProps) {
  const { result } = search;
  if (!result) {
    return <p className="px-3 py-2 text-sm text-gray-500">{search.number} 항공편을 찾고 있어요.</p>;
  }
  if (result.status !== 'ok') {
    return (
      <div className="flex flex-col items-start gap-2 px-3 py-2">
        <p role="alert" className="text-sm break-keep text-gray-600">
          {FLIGHT_MESSAGES[result.status]}
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
                onClick={() => onPick(leg)}
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
                  {adding === leg.number ? '추가하고 있어요' : pickLabel}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <FlightDataCredit className="px-3 pt-1" />
    </div>
  );
}

/** AeroDataBox's free plan asks for its name, linked, wherever its data shows. */
export function FlightDataCredit({ className }: { className?: string }) {
  return (
    <p className={`text-xs text-gray-400 ${className ?? ''}`}>
      항공편 정보:{' '}
      {/* Their terms: a working link that keeps the referrer (no `noreferrer`). */}
      <a href="https://aerodatabox.com" target="_blank" rel="noopener" className="underline">
        AeroDataBox
      </a>
    </p>
  );
}
