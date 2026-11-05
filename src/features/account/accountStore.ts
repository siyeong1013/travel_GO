import { createStore, useStore } from 'zustand';
import { syncEngine } from '@/data';
import type { Account, LoginError, LoginProvider } from '@/features/account/account';
import { type Auth, supabaseAuth } from '@/features/account/auth';
import { resetDataStores } from '@/features/dataStores';

/** `unavailable`: this build has no login (no Supabase project configured). */
export type AccountStatus = 'idle' | 'loading' | 'unavailable' | 'signedOut' | 'signedIn';

export interface AccountState {
  status: AccountStatus;
  account: Account | null;
  /** Why the login the page came back from didn't go through. */
  loginError: LoginError | null;
  /** Concurrent calls share one; after that the account follows sign-ins and sign-outs. */
  load: () => Promise<void>;
  /**
   * Leaves the app for the provider's login page, which brings the page back to `returnTo` (a path
   * of this site), the account screen by default.
   */
  signIn: (provider: LoginProvider, returnTo?: string) => Promise<void>;
  /** Takes the account's trips off this device, then signs out here. */
  signOut: () => Promise<void>;
}

interface AccountStoreOptions {
  /** Before signing out: takes the account's trips off the device. */
  forgetTrips?: () => Promise<void>;
}

export function createAccountStore(
  makeAuth: () => Auth | null,
  { forgetTrips = async () => {} }: AccountStoreOptions = {},
) {
  let auth: Auth | null = null;
  let inflight: Promise<void> | null = null;
  let stopListening = () => {};

  return createStore<AccountState>()((set, get) => {
    const show = (account: Account | null) =>
      set({ account, status: account ? 'signedIn' : 'signedOut' });

    function connected(): Auth {
      if (!auth) throw new Error('no login in this build');
      return auth;
    }

    return {
      status: 'idle',
      account: null,
      loginError: null,

      load() {
        if (get().status !== 'idle') return inflight ?? Promise.resolve();
        inflight = (async () => {
          auth = makeAuth();
          if (!auth) {
            set({ status: 'unavailable' });
            return;
          }
          set({ status: 'loading' });
          stopListening();
          stopListening = auth.onChange(show);
          try {
            const { account, error } = await auth.start();
            show(account);
            set({ loginError: error });
          } catch (error) {
            console.error(error);
            set({ status: 'signedOut', loginError: 'failed' });
          }
        })().finally(() => {
          inflight = null;
        });
        return inflight;
      },

      async signIn(provider, returnTo = '/account') {
        set({ loginError: null });
        await connected().signIn(provider, `${window.location.origin}${returnTo}`);
      },

      async signOut() {
        const auth = connected();
        await forgetTrips();
        await auth.signOut();
        show(null);
      },
    };
  });
}

export const accountStore = createAccountStore(supabaseAuth, {
  async forgetTrips() {
    await syncEngine.forget();
    resetDataStores();
  },
});

export function useAccountStore<T>(selector: (state: AccountState) => T): T {
  return useStore(accountStore, selector);
}
