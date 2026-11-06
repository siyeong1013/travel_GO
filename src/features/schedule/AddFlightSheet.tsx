import { type FormEvent, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { PlusIcon } from '@/components/ui/icons';
import type { LocalDate, Trip } from '@/data/models';
import {
  awaitingLookup,
  type FlightDraft,
  flightScheduleItems,
} from '@/features/schedule/flightDrafts';
import { FlightDraftRow } from '@/features/schedule/FlightDraftRow';
import { useScheduleStore } from '@/features/schedule/scheduleStore';
import { useFlightLookups } from '@/features/schedule/useFlightLookups';
import { diffDays, isDateInRange, isLocalDate } from '@/lib/dates';
import { errorMessage } from '@/lib/errorMessage';
import { parseFlightNumber } from '@/lib/flights';

/** A flight put in the schedule: its number, and the day it went to (null: the inbox). */
export interface AddedFlight {
  number: string;
  date: LocalDate | null;
}

interface AddFlightSheetProps {
  trip: Trip;
  /** A flight number typed in place search, and the day it was typed on (null: the inbox). */
  typed?: { number: string; date: LocalDate | null };
  /** After they went in; the sheet closes. */
  onAdded: (flights: AddedFlight[]) => void;
  onClose: () => void;
}

/**
 * Flights by number and day, as a multi-city booking lists them: two to begin with, on the trip's
 * first and last days (there and back), more for connections. Each is looked up as it is typed
 * (`useFlightLookups`) and goes into the schedule on the day it leaves, at its departure time and
 * airport; one not found by its number on its day (`flightScheduleItems`).
 */
export function AddFlightSheet({ trip, typed, onAdded, onClose }: AddFlightSheetProps) {
  const add = useScheduleStore((state) => state.add);
  const [flights, setFlights] = useState(() => startingFlights(trip, typed));
  const [errors, setErrors] = useState<Partial<Record<number, string>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookUp = useFlightLookups(flights, setFlights);
  // Flights typed whose answer hasn't come: put in now, they'd go in by their numbers only.
  const waiting = flights.some(awaitingLookup);

  /** Marks text that isn't a flight number; true when there is none and something is typed. */
  function checked(): boolean {
    const found: Partial<Record<number, string>> = {};
    for (const row of flights) {
      if (row.number.trim() && !parseFlightNumber(row.number)) {
        found[row.key] = '편명을 확인해 주세요. 예: KE723';
      }
    }
    if (flights.every((row) => !row.number.trim())) found[flights[0]!.key] = '편명을 입력해 주세요.';
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const added = new Map<string, AddedFlight>();
      for (const row of flights) {
        const number = parseFlightNumber(row.number);
        if (!number) continue;
        for (const item of flightScheduleItems([row], trip)) {
          await add(item);
          // A flight of several legs: each day once.
          added.set(`${number} ${item.date}`, { number, date: item.date });
        }
      }
      onAdded([...added.values()]);
      onClose();
    } catch (err) {
      console.error(err);
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!saving && !waiting && checked()) void save();
  }

  /** Where a day puts its flight: `Day 2`, or the inbox outside the trip. */
  function dayOf(date: string): string | undefined {
    if (!isLocalDate(date)) return undefined;
    return isDateInRange(date, trip.startDate, trip.endDate)
      ? `Day ${diffDays(trip.startDate, date) + 1}에 들어가요`
      : '보관함에 들어가요';
  }

  return (
    <BottomSheet open onClose={onClose} title="항공편 추가">
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3 px-3 pb-2">
        <p className="-mt-1 text-sm break-keep text-gray-500">
          가는 편, 오는 편, 갈아타는 편까지 한 번에 넣어요. 각 편은 출발일에 맞는 날에 들어가요.
        </p>
        {flights.map((row, index) => (
          <FlightDraftRow
            key={row.key}
            flight={row}
            title={`항공편 ${index + 1}`}
            fallback="넣으면 편명만 그 날 일정에 들어가요."
            error={errors[row.key]}
            dateHint={dayOf(row.date)}
            onChange={(change) => {
              setFlights((current) =>
                current.map((r) => (r.key === row.key ? { ...r, ...change } : r)),
              );
              setErrors((current) => ({ ...current, [row.key]: undefined }));
            }}
            onChoose={(leg) =>
              setFlights((current) => current.map((r) => (r.key === row.key ? { ...r, leg } : r)))
            }
            onLookUp={() => lookUp(row)}
            onRemove={
              flights.length > 1
                ? () => {
                    setFlights((current) => current.filter((r) => r.key !== row.key));
                    setErrors((current) => ({ ...current, [row.key]: undefined }));
                  }
                : undefined
            }
          />
        ))}
        <Button
          variant="secondary"
          className="gap-1"
          onClick={() =>
            setFlights((current) => [
              ...current,
              // Likely a connection or the way back: on the last day to begin with.
              {
                key: (current.at(-1)?.key ?? 0) + 1,
                number: '',
                date: trip.endDate,
                lookup: null,
                leg: 0,
              },
            ])
          }
        >
          <PlusIcon width={18} height={18} />
          항공편 더 넣기
        </Button>
        {error && (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}
        <Button type="submit" block disabled={saving || waiting}>
          {waiting ? '항공편을 찾고 있어요' : '일정에 넣기'}
        </Button>
      </form>
    </BottomSheet>
  );
}

/**
 * The way there on the trip's first day and back on its last. A number typed in place search goes
 * in the way back when typed on the last day, else the way there, on the day it was typed.
 */
function startingFlights(trip: Trip, typed: AddFlightSheetProps['typed']): FlightDraft[] {
  const out: FlightDraft = { key: 1, number: '', date: trip.startDate, lookup: null, leg: 0 };
  const back: FlightDraft = { key: 2, number: '', date: trip.endDate, lookup: null, leg: 0 };
  if (!typed) return [out, back];
  if (trip.startDate < trip.endDate && typed.date === trip.endDate) back.number = typed.number;
  else Object.assign(out, { number: typed.number, date: typed.date ?? trip.startDate });
  return [out, back];
}
