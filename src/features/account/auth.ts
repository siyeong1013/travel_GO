import {
  type Account,
  LOGIN_RETURN_PARAMS,
  type LoginError,
  type LoginProvider,
  loginOutcome,
  toAccount,
} from '@/features/account/account';
import { supabase, supabaseConfig } from '@/lib/supabase';

/** Login as the account screen needs it: the app's is Supabase's, tests use a fake client. */
export interface Auth {
  /**
   * The signed-in account (null: signed out), once a login the page came back from has finished;
   * `error` when that login didn't go through.
   */
  start: () => Promise<{ account: Account | null; error: LoginError | null }>;
  /** Signing in or out, also in another tab or when the session ends. Returns the unsubscribe. */
  onChange: (listener: (account: Account | null) => void) => () => void;
  /** Leaves for the provider's login page, which sends the page back to `returnTo`. */
  signIn: (provider: LoginProvider, returnTo: string) => Promise<void>;
  /** On this device only; without a connection it still forgets the session here. */
  signOut: () => Promise<void>;
}

/** Login with the app's Supabase project; null when the build has none (`supabaseConfig`). */
export function supabaseAuth(): Auth | null {
  const config = supabaseConfig();
  if (!config) return null;
  const auth = async () => (await supabase(config)).auth;

  return {
    async start() {
      const client = await auth();
      // Trades a returned `?code=` for a session (the client starts doing so when it's made).
      await client.initialize();
      const error = loginOutcome(window.location.search);
      if (error) removeParams(LOGIN_RETURN_PARAMS);
      const { data } = await client.getSession();
      return { account: data.session ? toAccount(data.session.user) : null, error };
    },

    onChange(listener) {
      let stopped = false;
      let unsubscribe = () => {};
      void auth().then((client) => {
        if (stopped) return;
        const { data } = client.onAuthStateChange((_event, session) =>
          listener(session ? toAccount(session.user) : null),
        );
        unsubscribe = () => data.subscription.unsubscribe();
      });
      return () => {
        stopped = true;
        unsubscribe();
      };
    },

    async signIn(provider, returnTo) {
      const { error } = await (await auth()).signInWithOAuth({
        provider,
        options: { redirectTo: returnTo },
      });
      if (error) throw error;
    },

    async signOut() {
      const { error } = await (await auth()).signOut({ scope: 'local' });
      if (error) console.warn(error);
    },
  };
}

/**
 * Takes parameters off the address, from the query and from a fragment that holds them, without a
 * navigation (as the Supabase client does).
 */
function removeParams(names: string[]) {
  const url = new URL(window.location.href);
  for (const name of names) url.searchParams.delete(name);
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (names.some((name) => fragment.has(name))) {
    for (const name of names) fragment.delete(name);
    url.hash = fragment.toString();
  }
  window.history.replaceState(window.history.state, '', url);
}
