import type { LocalDate } from '@/data/models';
import type { FlightAnswer } from '@/lib/flights';
import { supabase, supabaseConfig } from '@/lib/supabase';

const TIMEOUT_MS = 20_000;
const STATUSES = ['ok', 'notFound', 'invalid', 'signedOut', 'unavailable', 'busy', 'error'];

/** What looking up a flight came to; `offline` before even asking. */
export type FlightLookup = FlightAnswer | { status: 'offline' };

/** Why a lookup found no flight, as the screens say it. */
export const FLIGHT_MESSAGES: Record<Exclude<FlightLookup['status'], 'ok'>, string> = {
  notFound: '이 날짜에 출발하는 항공편을 찾지 못했어요. 편명과 날짜를 확인해 주세요.',
  invalid: '편명을 확인해 주세요. 예: KE723',
  signedOut: '로그인하면 항공편 정보를 불러올 수 있어요.',
  unavailable: '지금은 항공편 정보를 불러올 수 없어요.',
  busy: '이번 달 항공편 조회를 다 썼거나 잠시 붐벼요. 나중에 다시 시도해 주세요.',
  error: '항공편 정보를 불러오지 못했어요.',
  offline: '인터넷에 연결되면 항공편 정보를 불러올 수 있어요.',
};

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
