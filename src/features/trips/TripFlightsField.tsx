import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { PlusIcon } from '@/components/ui/icons';
import { airportName, arrivalText } from '@/features/schedule/flightItem';
import { FLIGHT_MESSAGES } from '@/features/schedule/flightLookup';
import { FlightDataCredit } from '@/features/schedule/FlightResults';
import { type FlightDraft, foundLegs } from '@/features/trips/tripForm';
import { isLocalDate } from '@/lib/dates';
import { parseFlightNumber } from '@/lib/flights';

interface TripFlightsFieldProps {
  flights: FlightDraft[];
  onAdd: () => void;
  onChange: (key: number, change: Partial<Pick<FlightDraft, 'number' | 'date'>>) => void;
  onRemove: (key: number) => void;
  onLookUp: (key: number) => void;
}

/**
 * A new trip's flights, by number and day: looked up (AeroDataBox, signed in), each goes into the
 * schedule at its departure time, and the countries they land in into the trip's.
 */
export function TripFlightsField({ flights, onAdd, onChange, onRemove, onLookUp }: TripFlightsFieldProps) {
  return (
    <section aria-labelledby="trip-flights" className="flex flex-col gap-2">
      <h2 id="trip-flights" className="text-sm font-semibold text-gray-700">
        항공편
      </h2>
      <p className="text-sm break-keep text-gray-500">
        편명을 넣으면 출발·도착 시각이 일정에 들어가고, 도착하는 나라가 더해져요.
      </p>
      {flights.map((flight, index) => (
        <FlightRow
          key={flight.key}
          flight={flight}
          title={`항공편 ${index + 1}`}
          onChange={(change) => onChange(flight.key, change)}
          onRemove={() => onRemove(flight.key)}
          onLookUp={() => onLookUp(flight.key)}
        />
      ))}
      <Button variant="secondary" onClick={onAdd} className="gap-1">
        <PlusIcon width={18} height={18} />
        {flights.length > 0 ? '항공편 더 넣기' : '항공편 넣기'}
      </Button>
    </section>
  );
}

interface FlightRowProps {
  flight: FlightDraft;
  title: string;
  onChange: (change: Partial<Pick<FlightDraft, 'number' | 'date'>>) => void;
  onRemove: () => void;
  onLookUp: () => void;
}

function FlightRow({ flight, title, onChange, onRemove, onLookUp }: FlightRowProps) {
  const number = parseFlightNumber(flight.number);
  const { lookup } = flight;
  // The answer for the number and day as they read now.
  const current = lookup && lookup.number === number && lookup.date === flight.date ? lookup : null;
  const legs = foundLegs(flight);

  return (
    <fieldset className="flex flex-col gap-2 rounded-2xl border border-gray-100 p-3">
      <legend className="sr-only">{title}</legend>
      <div className="flex items-center justify-between">
        <span aria-hidden="true" className="text-sm font-semibold text-gray-500">
          {title}
        </span>
        <button
          type="button"
          aria-label={`${title} 빼기`}
          onClick={onRemove}
          className="-my-2 -mr-2 flex h-11 items-center px-2 text-sm font-semibold text-gray-500"
        >
          빼기
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <TextField
          label="편명"
          placeholder="예: KE723"
          autoComplete="off"
          autoCapitalize="characters"
          enterKeyHint="done"
          value={flight.number}
          onChange={(event) => onChange({ number: event.target.value })}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
            // Looks the flight up rather than sending the form.
            event.preventDefault();
            if (number && !current && isLocalDate(flight.date)) onLookUp();
            else event.currentTarget.blur();
          }}
        />
        <TextField
          label="출발일"
          type="date"
          value={flight.date}
          onChange={(event) => onChange({ date: event.target.value })}
        />
      </div>
      {number && !current && (
        isLocalDate(flight.date) ? (
          <Button variant="secondary" onClick={onLookUp}>
            {number} 항공편 정보 불러오기
          </Button>
        ) : (
          <p className="text-sm text-gray-500">출발일을 고르면 항공편 정보를 불러올 수 있어요.</p>
        )
      )}
      {current && !current.result && (
        <p role="status" className="text-sm text-gray-500">
          {number} 항공편을 찾고 있어요.
        </p>
      )}
      {current?.result &&
        (current.result.status === 'ok' ? (
          <div>
            <ul className="flex flex-col gap-1">
              {legs.map((leg) => (
                <li key={`${leg.number} ${leg.departure.iata} ${leg.departure.time}`} className="text-sm">
                  <span className="font-semibold">
                    {leg.number}
                    {leg.airline && <span className="font-normal text-gray-500"> · {leg.airline}</span>}
                  </span>
                  <span className="block text-gray-600">
                    {airportName(leg.departure)} {leg.departure.time ?? ''} → {airportName(leg.arrival)}{' '}
                    {arrivalText(leg)}
                  </span>
                </li>
              ))}
            </ul>
            <FlightDataCredit className="pt-1" />
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <p role="alert" className="text-sm break-keep text-gray-600">
              {FLIGHT_MESSAGES[current.result.status]} 만들면 편명만 일정에 들어가요.
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
