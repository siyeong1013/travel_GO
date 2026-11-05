import type { LocalDate } from '@/data/models';
import type { FlightAnswer } from '@/lib/flights';
import { supabase, supabaseConfig } from '@/lib/supabase';

const TIMEOUT_MS = 20_000;
const STATUSES = ['ok', 'notFound', 'invalid', 'signedOut', 'unavailable', 'busy', 'error'];

/** What looking up a flight came to; `offline` before even asking. */
export type FlightLookup = FlightAnswer | { status: 'offline' };

/**
 * The legs of flight `number` leaving on `date` (local), from the app's server function
 * (api/flight.ts) as the signed-in account.
 */
export async function lookUpFlight(number: string, date: LocalDate): Promise<FlightLookup> {
  const config = supabaseConfig();
  if (!config) return { status: 'unavailable' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { status: 'offline' };
  try {
    const { data } = await (await supabase(config)).auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { status: 'signedOut' };
    const params = new URLSearchParams({ number, date });
    const response = await fetch(`/api/flight?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => null)) as FlightAnswer | null;
    return body && STATUSES.includes(body.status) ? body : { status: 'error' };
  } catch (error) {
    console.error(error);
    return { status: navigator.onLine === false ? 'offline' : 'error' };
  }
}
