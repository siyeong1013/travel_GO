import type { User } from '@supabase/supabase-js';

export type LoginProvider = 'kakao' | 'google';

/** Who is signed in, as the app shows them. */
export interface Account {
  id: string;
  /** From the provider's profile (Kakao: the nickname). */
  name: string;
  avatarUrl: string | null;
  provider: LoginProvider | null;
}

/** Why a login the page came back from didn't go through. */
export type LoginError = 'cancelled' | 'failed';

/** The account of a Supabase user, from what the login provider filled in. */
export function toAccount(user: Pick<User, 'id' | 'user_metadata' | 'app_metadata'>): Account {
  const meta: Record<string, unknown> = user.user_metadata ?? {};
  const provider = user.app_metadata?.provider;
  return {
    id: user.id,
    name: text(meta.full_name) ?? text(meta.name) ?? text(meta.preferred_username) ?? '이름 없음',
    avatarUrl: photo(meta.avatar_url) ?? photo(meta.picture),
    provider: provider === 'kakao' || provider === 'google' ? provider : null,
  };
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** Some Kakao photos come as http://, which an https page would block: ask for https instead. */
function photo(value: unknown): string | null {
  const url = text(value);
  if (url?.startsWith('https://')) return url;
  if (url?.startsWith('http://')) return `https://${url.slice('http://'.length)}`;
  return null;
}

/**
 * The address parameters a login sends the page back with: `code` (traded for a session) or an
 * `error`. `sb_flow_id` goes with the code. Supabase repeats an error in the fragment and marks it
 * with `sb` (`#error=…&sb=`).
 */
export const LOGIN_RETURN_PARAMS = ['code', 'sb_flow_id', 'error', 'error_code', 'error_description', 'sb'];

/**
 * How the login the page came back from ended, read once the client has started: a `code` still
 * in the address was not traded for a session (e.g. the login began in another browser).
 */
export function loginOutcome(search: string): LoginError | null {
  const params = new URLSearchParams(search);
  const error = params.get('error');
  // The person said no at Kakao or Google. Supabase's own refusals (sign-ups off, a banned user)
  // are `access_denied` too, but they come with an `error_code`.
  if (error) return error === 'access_denied' && !params.has('error_code') ? 'cancelled' : 'failed';
  return params.has('code') ? 'failed' : null;
}
