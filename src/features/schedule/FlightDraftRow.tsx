import { useId } from 'react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import {
  awaitingLookup,
  currentLookup,
  type FlightDraft,
  foundLegs,
} from '@/features/schedule/flightDrafts';
import { FLIGHT_MESSAGES } from '@/features/schedule/flightLookup';
import { FlightDataCredit, FlightRoute } from '@/features/schedule/FlightResults';
import { isLocalDate } from '@/lib/dates';
import { parseFlightNumber } from '@/lib/flights';

interface FlightDraftRowProps {
  flight: FlightDraft;
  /** `항공편 1`. */
  title: string;
  /** What a flight not found becomes when the form is sent: `만들면 편명만 일정에 들어가요.` */
  fallback: string;
  /** Under the number. */
  error?: string;
  /** Under the day: where it puts the flight (`Day 2에 들어가요`). */
  dateHint?: string;
  onChange: (change: Partial<Pick<FlightDraft, 'number' | 'date'>>) => void;
  /** Picks one of the flights found (`FlightDraft.leg`). */
  onChoose: (leg: number) => void;
  /** Asks at once: Enter, or again after a failure (it is asked by itself as it is typed). */
  onLookUp: () => void;
  onRemove?: () => void;
}

/**
 * A flight by its number and day, and what looking it up as typed found: the flights to pick
 * from (one picked to begin with), or why there are none.
 */
export function FlightDraftRow({
  flight,
  title,
  fallback,
  error,
  dateHint,
  onChange,
  onChoose,
  onLookUp,
  onRemove,
}: FlightDraftRowProps) {
  const id = useId();
  const number = parseFlightNumber(flight.number);
  const current = currentLookup(flight);
  const legs = foundLegs(flight);
  const chosen = legs[flight.leg] ? flight.leg : 0;

  return (
    <fieldset className="flex flex-col gap-2 rounded-2xl border border-gray-100 p-3">
      <legend className="sr-only">{title}</legend>
      <div className="flex items-center justify-between">
        <span aria-hidden="true" className="text-sm font-semibold text-gray-500">
          {title}
        </span>
        {onRemove && (
          <button
            type="button"
            aria-label={`${title} 빼기`}
            onClick={onRemove}
            className="-my-2 -mr-2 flex h-11 items-center px-2 text-sm font-semibold text-gray-500"
          >
            빼기
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <TextField
          label="편명"
          placeholder="예: KE723"
          autoComplete="off"
          autoCapitalize="characters"
          enterKeyHint="search"
          value={flight.number}
          error={error}
          onChange={(event) => onChange({ number: event.target.value })}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
            // Asks now rather than sending the form.
            event.preventDefault();
            if (awaitingLookup(flight) && !current) onLookUp();
            else event.currentTarget.blur();
          }}
        />
        <TextField
          label="출발일"
          type="date"
          value={flight.date}
          hint={dateHint}
          onChange={(event) => onChange({ date: event.target.value })}
        />
      </div>
      {number && !isLocalDate(flight.date) && (
        <p className="text-sm text-gray-500">출발일을 고르면 항공편 정보를 불러올 수 있어요.</p>
      )}
      {awaitingLookup(flight) && (
        <p role="status" className="text-sm text-gray-500">
          {number} 항공편을 찾고 있어요.
        </p>
      )}
      {current?.result &&
        (current.result.status === 'ok' ? (
          <div>
            <div
              role="radiogroup"
              aria-label={`${title} 찾은 항공편`}
              className="overflow-hidden rounded-xl border border-gray-200"
            >
              {legs.map((leg, index) => (
                <label
                  key={`${leg.number} ${leg.departure.iata} ${leg.departure.time}`}
                  className="flex cursor-pointer items-start gap-3 px-3 py-2.5 text-sm not-first:border-t not-first:border-gray-100 has-checked:bg-brand-50"
                >
                  <input
                    type="radio"
                    name={`${id}-leg`}
                    checked={index === chosen}
                    onChange={() => onChoose(index)}
                    className="mt-0.5 size-4 shrink-0 accent-brand-600"
                  />
                  <span className="min-w-0">
                    <span className="font-semibold">
                      {leg.number}
                      {leg.airline && <span className="font-normal text-gray-500"> · {leg.airline}</span>}
                    </span>
                    <FlightRoute leg={leg} className="block text-gray-600" />
                  </span>
                </label>
              ))}
            </div>
            <FlightDataCredit className="pt-1" />
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <p role="alert" className="text-sm break-keep text-gray-600">
              {FLIGHT_MESSAGES[current.result.status]} {fallback}
            </p>
            {(current.result.status === 'error' || current.result.status === 'offline') && (
              <Button variant="secondary" onClick={onLookUp}>
                다시 시도
              </Button>
            )}
          </div>
        ))}
    </fieldset>
  );
}
