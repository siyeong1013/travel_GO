import { Button } from '@/components/ui/Button';
import { PlusIcon } from '@/components/ui/icons';
import type { FlightDraft } from '@/features/schedule/flightDrafts';
import { FlightDraftRow } from '@/features/schedule/FlightDraftRow';

interface TripFlightsFieldProps {
  flights: FlightDraft[];
  onAdd: () => void;
  onChange: (key: number, change: Partial<Pick<FlightDraft, 'number' | 'date'>>) => void;
  onChoose: (key: number, leg: number) => void;
  onRemove: (key: number) => void;
  /** Asks about a row at once (they are looked up as they are typed). */
  onLookUp: (flight: FlightDraft) => void;
}

/**
 * A new trip's flights, by number and day: looked up as typed (AeroDataBox, signed in), each goes
 * into the schedule at its departure time, and the countries they land in into the trip's.
 */
export function TripFlightsField({
  flights,
  onAdd,
  onChange,
  onChoose,
  onRemove,
  onLookUp,
}: TripFlightsFieldProps) {
  return (
    <section aria-labelledby="trip-flights" className="flex flex-col gap-2">
      <h2 id="trip-flights" className="text-sm font-semibold text-gray-700">
        항공편
      </h2>
      <p className="text-sm break-keep text-gray-500">
        편명을 넣으면 출발·도착 시각과 공항이 일정에 들어가고, 도착하는 나라가 더해져요.
      </p>
      {flights.map((flight, index) => (
        <FlightDraftRow
          key={flight.key}
          flight={flight}
          title={`항공편 ${index + 1}`}
          fallback="만들면 편명만 일정에 들어가요."
          onChange={(change) => onChange(flight.key, change)}
          onChoose={(leg) => onChoose(flight.key, leg)}
          onRemove={() => onRemove(flight.key)}
          onLookUp={() => onLookUp(flight)}
        />
      ))}
      <Button variant="secondary" onClick={onAdd} className="gap-1">
        <PlusIcon width={18} height={18} />
        {flights.length > 0 ? '항공편 더 넣기' : '항공편 넣기'}
      </Button>
    </section>
  );
}
