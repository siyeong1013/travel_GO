import { useEffect, useEffectEvent, useRef } from 'react';
import {
  answered,
  asking,
  awaitingLookup,
  type FlightDraft,
} from '@/features/schedule/flightDrafts';
import { type FlightLookup, lookUpFlight } from '@/features/schedule/flightLookup';
import { parseFlightNumber } from '@/lib/flights';

/**
 * How long typing pauses before a flight is looked up: a number is asked about once it's typed,
 * not at each key (each lookup counts against the month's quota).
 */
export const LOOKUP_DELAY_MS = 700;

/**
 * Looks a form's flight rows up as they are typed: once the rows stay as they are for a moment,
 * each with a number and a day not asked about yet. Answers found or not found are kept while the
 * form is open, so a number typed again isn't asked again. `onAnswered` hears that row `key` took
 * an answer. Returns a way to ask about a row at once (Enter, or again after a failure).
 */
export function useFlightLookups(
  flights: FlightDraft[],
  setFlights: (change: (flights: FlightDraft[]) => FlightDraft[]) => void,
  onAnswered?: (key: number) => void,
): (row: FlightDraft) => void {
  const answers = useRef(new Map<string, FlightLookup>());

  function ask(row: FlightDraft) {
    const number = parseFlightNumber(row.number);
    if (!number) return;
    const { key, date } = row;
    setFlights((current) => asking(current, key, number, date));
    const known = answers.current.get(`${number} ${date}`);
    void (known ? Promise.resolve(known) : lookUpFlight(number, date)).then((result) => {
      if (result.status === 'ok' || result.status === 'notFound') {
        answers.current.set(`${number} ${date}`, result);
      }
      setFlights((current) => answered(current, key, number, date, result));
      onAnswered?.(key);
    });
  }

  const askWaiting = useEffectEvent(() => {
    for (const row of flights) if (awaitingLookup(row)) ask(row);
  });

  // The rows to ask about, as they read: any change starts the wait over.
  const waiting = flights
    .filter(awaitingLookup)
    .map((row) => `${row.key} ${row.number} ${row.date}`)
    .join('|');
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(askWaiting, LOOKUP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [waiting]);

  return ask;
}
