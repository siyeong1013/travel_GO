// A stand-in for the Supabase client in tests: the test file mocks '@supabase/supabase-js' so that
// `createClient` returns `supabaseFake.client` (see `app/accountFlows.test.tsx`).
import type { Session, User } from '@supabase/supabase-js';

type AuthListener = (event: string, session: Session | null) => void;

function user(provider: 'kakao' | 'google', metadata: Record<string, string>): User {
  return {
    id: `user-${provider}`,
    aud: 'authenticated',
    created_at: '2026-11-04T00:00:00Z',
    app_metadata: { provider, providers: [provider] },
    user_metadata: metadata,
  } as User;
}

/** A user as Supabase fills it in after a Kakao login: nickname and photo (an http:// one). */
export const kakaoUser = (name = '김여행') =>
  user('kakao', {
    full_name: name,
    name,
    preferred_username: name,
    avatar_url: 'http://k.kakaocdn.net/dn/profile.jpg',
  });

/** A user after a Google login: name and photo (`picture` too), and an email the app doesn't use. */
export const googleUser = (name = 'Jane Doe') =>
  user('google', {
    full_name: name,
    name,
    avatar_url: 'https://lh3.googleusercontent.com/a/photo',
    picture: 'https://lh3.googleusercontent.com/a/photo',
    email: 'jane@example.com',
  });

/** The client's `auth`, in memory: what `features/account/auth.ts` uses of it. */
export function fakeSupabase() {
  let session: Session | null = null;
  let returning: User | null = null;
  const listeners = new Set<AuthListener>();
  const signIns: { provider: string; redirectTo?: string }[] = [];
  const signOuts: { scope?: string }[] = [];

  const sessionOf = (person: User) =>
    ({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600, token_type: 'bearer', user: person }) as Session;
  const emit = (event: string) => {
    for (const listener of listeners) listener(event, session);
  };

  const auth = {
    /** Like the real one: trades a returned `?code=` for a session and takes it off the address. */
    async initialize() {
      const url = new URL(window.location.href);
      if (url.searchParams.has('code') && returning) {
        session = sessionOf(returning);
        returning = null;
        url.searchParams.delete('code');
        window.history.replaceState(window.history.state, '', url);
        emit('SIGNED_IN');
      }
      return { error: null };
    },
    async getSession() {
      return { data: { session }, error: null };
    },
    onAuthStateChange(listener: AuthListener) {
      listeners.add(listener);
      queueMicrotask(() => listener('INITIAL_SESSION', session));
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    },
    async signInWithOAuth({ provider, options }: { provider: string; options?: { redirectTo?: string } }) {
      signIns.push({ provider, redirectTo: options?.redirectTo });
      return { data: { provider, url: `https://test.supabase.co/auth/v1/authorize?provider=${provider}` }, error: null };
    },
    async signOut(options?: { scope?: string }) {
      signOuts.push(options ?? {});
      session = null;
      emit('SIGNED_OUT');
      return { error: null };
    },
  };

  return {
    client: { auth },
    /** Logins started: provider and where the page should come back to. */
    signIns,
    signOuts,
    /** Signed in before the page loaded (a session on the device). */
    signedIn(person: User) {
      session = sessionOf(person);
    },
    /** The page comes back from a login as `person`: put `?code=` in the address, then load it. */
    returnsAs(person: User) {
      returning = person;
    },
    /** Someone signs in or out in another tab. */
    changeElsewhere(person: User | null) {
      session = person && sessionOf(person);
      emit(person ? 'SIGNED_IN' : 'SIGNED_OUT');
    },
    reset() {
      session = null;
      returning = null;
      listeners.clear();
      signIns.length = 0;
      signOuts.length = 0;
    },
  };
}

/** One per test file: the app keeps the first client it makes (`lib/supabase.ts`). */
export const supabaseFake = fakeSupabase();
