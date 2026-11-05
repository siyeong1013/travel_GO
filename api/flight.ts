// The app's flight lookup (Vercel function at /api/flight; the dev server serves it too, see
// vite.config.ts): a flight number on a departure date → its legs, from AeroDataBox (RapidAPI).
// The key stays here; only signed-in accounts may ask, as the free plan's quota is the app's.
// Self-contained: Node runs it as an ES module, so it imports nothing of the app but types.
import type { FlightAnswer, FlightEnd, FlightLeg } from '../src/lib/flights.ts';

export interface FlightEnv {
  /** RapidAPI key of the AeroDataBox subscription. Server only: never `VITE_`. */
  AERODATABOX_API_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

const AERODATABOX_HOST = 'aerodatabox.p.rapidapi.com';
const TIMEOUT_MS = 10_000;

type Json = Record<string, unknown>;

const json = (value: unknown): Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {};
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/** A scheduled time's local date and time: `2026-12-01 10:00+09:00` → `2026-12-01`, `10:00`. */
function localParts(movement: Json): [string | null, string | null] {
  const local = text(json(movement.scheduledTime).local) ?? text(movement.scheduledTimeLocal);
  const match = local ? /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(local) : null;
  return match ? [match[1]!, match[2]!] : [null, null];
}

function flightEnd(value: unknown): FlightEnd {
  const movement = json(value);
  const airport = json(movement.airport);
  const [date, time] = localParts(movement);
  const country = text(airport.countryCode)?.toUpperCase() ?? '';
  return {
    iata: text(airport.iata),
    name: text(airport.shortName) ?? text(airport.municipalityName) ?? text(airport.name) ?? '?',
    countryCode: /^[A-Z]{2}$/.test(country) ? country : null,
    date,
    time,
    terminal: text(movement.terminal),
  };
}

/**
 * AeroDataBox's flights (`/flights/number/{number}/{date}`): passenger ones, each once, with only
 * what the schedule keeps (its terms: no more than the record needs).
 */
export function flightsFromAeroDataBox(body: unknown): FlightLeg[] {
  if (!Array.isArray(body)) return [];
  const legs = new Map<string, FlightLeg>();
  for (const value of body) {
    const flight = json(value);
    if (flight.isCargo === true) continue;
    const number = text(flight.number)?.replace(/\s+/g, '');
    if (!number) continue;
    const leg: FlightLeg = {
      number,
      airline: text(json(flight.airline).name),
      departure: flightEnd(flight.departure),
      arrival: flightEnd(flight.arrival),
    };
    const key = [number, leg.departure.iata, leg.departure.time, leg.arrival.iata].join(' ');
    if (!legs.has(key)) legs.set(key, leg);
  }
  return [...legs.values()];
}

function answer(status: number, body: FlightAnswer): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** Whether `token` is a signed-in session of the app's Supabase project. */
async function signedIn(token: string, url: string, key: string, fetchFn: typeof fetch) {
  const response = await fetchFn(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return response.ok;
}

/** `GET /api/flight?number=KE723&date=2026-12-01`, with the session as `Authorization: Bearer`. */
export async function answerFlightRequest(
  request: Request,
  env: FlightEnv,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const number = params.get('number') ?? '';
  const date = params.get('date') ?? '';
  // As `parseFlightNumber` (src/lib/flights.ts) cleans them.
  if (!/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(number) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return answer(400, { status: 'invalid' });
  }

  const key = env.AERODATABOX_API_KEY?.trim();
  const url = env.VITE_SUPABASE_URL?.trim();
  const publishable = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!key || !url || !publishable) return answer(503, { status: 'unavailable' });

  try {
    const token = /^Bearer (\S+)$/.exec(request.headers.get('Authorization') ?? '')?.[1];
    if (!token || !(await signedIn(token, url, publishable, fetchFn))) {
      return answer(401, { status: 'signedOut' });
    }

    const response = await fetchFn(
      `https://${AERODATABOX_HOST}/flights/number/${number}/${date}` +
        '?dateLocalRole=Departure&withAircraftImage=false&withLocation=false',
      {
        headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': AERODATABOX_HOST },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    // No such flight that day, or a date the data doesn't cover.
    if ([204, 400, 404].includes(response.status)) return answer(200, { status: 'notFound' });
    if (response.status === 429) return answer(429, { status: 'busy' });
    if (response.status === 401 || response.status === 403) {
      console.error(`[flight] AeroDataBox refused the key (${response.status})`);
      return answer(503, { status: 'unavailable' });
    }
    if (!response.ok) {
      console.error(`[flight] AeroDataBox answered ${response.status}`);
      return answer(502, { status: 'error' });
    }
    const flights = flightsFromAeroDataBox(await response.json());
    return answer(200, flights.length > 0 ? { status: 'ok', flights } : { status: 'notFound' });
  } catch (error) {
    console.error('[flight]', error);
    return answer(502, { status: 'error' });
  }
}

export function GET(request: Request): Promise<Response> {
  return answerFlightRequest(request, process.env);
}
