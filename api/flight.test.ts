import { describe, expect, it, vi } from 'vitest';
import { answerFlightRequest, flightsFromAeroDataBox } from './flight.ts';

// A flight as AeroDataBox's `/flights/number/{number}/{date}` describes it (FlightContract).
const KE723 = {
  number: 'KE 723',
  status: 'Expected',
  codeshareStatus: 'IsOperator',
  isCargo: false,
  lastUpdatedUtc: '2026-11-05 03:00Z',
  airline: { name: 'Korean Air', iata: 'KE', icao: 'KAL' },
  aircraft: { model: 'Boeing 777-300ER' },
  departure: {
    airport: { icao: 'RKSI', iata: 'ICN', name: 'Seoul Incheon', shortName: 'Incheon', municipalityName: 'Seoul', countryCode: 'KR', timeZone: 'Asia/Seoul', location: { lat: 37.46, lon: 126.44 } },
    scheduledTime: { utc: '2026-12-01 00:00Z', local: '2026-12-01 09:00+09:00' },
    terminal: '2',
    quality: ['Basic'],
  },
  arrival: {
    airport: { icao: 'RJBB', iata: 'KIX', name: 'Osaka Kansai', shortName: 'Kansai', municipalityName: 'Osaka', countryCode: 'JP', timeZone: 'Asia/Tokyo', location: { lat: 34.43, lon: 135.24 } },
    scheduledTime: { utc: '2026-12-01 01:55Z', local: '2026-12-01 10:55+09:00' },
    terminal: '1',
    quality: ['Basic'],
  },
};

const ENV = {
  AERODATABOX_API_KEY: 'rapid-key',
  VITE_SUPABASE_URL: 'https://test.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
};

const request = (query: string, token: string | null = 'session') =>
  new Request(`https://travel-go.test/api/flight?${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

/** Supabase knows `session`; AeroDataBox answers `aero`. */
function servers(aero: () => Response) {
  return vi.fn<typeof fetch>(async (input, init) => {
    if (String(input).startsWith('https://test.supabase.co/auth/v1/user')) {
      const known = new Headers(init?.headers).get('Authorization') === 'Bearer session';
      return new Response('{}', { status: known ? 200 : 401 });
    }
    return aero();
  });
}

const body = async (response: Response) => [response.status, await response.json()];

describe('flightsFromAeroDataBox', () => {
  it('keeps what the schedule needs', () => {
    expect(flightsFromAeroDataBox([KE723])).toEqual([
      {
        number: 'KE723',
        airline: 'Korean Air',
        departure: { iata: 'ICN', name: 'Incheon', countryCode: 'KR', date: '2026-12-01', time: '09:00', terminal: '2' },
        arrival: { iata: 'KIX', name: 'Kansai', countryCode: 'JP', date: '2026-12-01', time: '10:55', terminal: '1' },
      },
    ]);
  });

  it('skips cargo and repeats, and survives missing parts', () => {
    expect(flightsFromAeroDataBox([KE723, KE723, { ...KE723, isCargo: true }])).toHaveLength(1);
    const bare = flightsFromAeroDataBox([{ number: 'XX1', departure: {}, arrival: { airport: { name: 'Far' } } }]);
    expect(bare[0]).toEqual({
      number: 'XX1',
      airline: null,
      departure: { iata: null, name: '?', countryCode: null, date: null, time: null, terminal: null },
      arrival: { iata: null, name: 'Far', countryCode: null, date: null, time: null, terminal: null },
    });
    expect(flightsFromAeroDataBox({ message: 'nope' })).toEqual([]);
  });
});

describe('answerFlightRequest', () => {
  it('asks AeroDataBox for the departures of that day, with the key', async () => {
    const fetch = servers(() => Response.json([KE723]));
    const response = await answerFlightRequest(request('number=KE723&date=2026-12-01'), ENV, fetch);
    expect(await body(response)).toEqual([200, { status: 'ok', flights: flightsFromAeroDataBox([KE723]) }]);
    const [url, init] = fetch.mock.calls[1]!;
    expect(String(url)).toBe(
      'https://aerodatabox.p.rapidapi.com/flights/number/KE723/2026-12-01?dateLocalRole=Departure&withAircraftImage=false&withLocation=false',
    );
    expect(new Headers(init?.headers).get('X-RapidAPI-Key')).toBe('rapid-key');
  });

  it('answers only signed-in accounts', async () => {
    const fetch = servers(() => Response.json([KE723]));
    for (const token of [null, 'stranger']) {
      const response = await answerFlightRequest(request('number=KE723&date=2026-12-01', token), ENV, fetch);
      expect(await body(response)).toEqual([401, { status: 'signedOut' }]);
    }
    expect(fetch.mock.calls.every(([url]) => String(url).includes('supabase'))).toBe(true);
  });

  it('turns down what isn’t a flight number and a date', async () => {
    const fetch = servers(() => Response.json([]));
    for (const query of ['number=오사카&date=2026-12-01', 'number=KE723&date=tomorrow', '']) {
      expect(await body(await answerFlightRequest(request(query), ENV, fetch))).toEqual([400, { status: 'invalid' }]);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('says what AeroDataBox couldn’t answer', async () => {
    const ask = (aero: () => Response) =>
      answerFlightRequest(request('number=KE723&date=2026-12-01'), ENV, servers(aero)).then(body);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await ask(() => new Response(null, { status: 204 }))).toEqual([200, { status: 'notFound' }]);
    expect(await ask(() => Response.json([]))).toEqual([200, { status: 'notFound' }]);
    expect(await ask(() => new Response('{}', { status: 429 }))).toEqual([429, { status: 'busy' }]);
    expect(await ask(() => new Response('{}', { status: 403 }))).toEqual([503, { status: 'unavailable' }]);
    expect(await ask(() => new Response('{}', { status: 500 }))).toEqual([502, { status: 'error' }]);
    expect(await ask(() => { throw new TypeError('offline'); })).toEqual([502, { status: 'error' }]);
  });

  it('is unavailable without a key', async () => {
    const fetch = servers(() => Response.json([KE723]));
    const response = await answerFlightRequest(
      request('number=KE723&date=2026-12-01'),
      { ...ENV, AERODATABOX_API_KEY: '' },
      fetch,
    );
    expect(await body(response)).toEqual([503, { status: 'unavailable' }]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
