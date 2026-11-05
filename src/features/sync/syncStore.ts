import { createStore, type StoreApi, useStore } from 'zustand';
import { onLocalWrite, syncEngine, watchServer } from '@/data';
import type { ID, ISODateTime } from '@/data/models';
import type { TripRole } from '@/data/sharing/sharing';
import type { SyncEngine } from '@/data/sync/syncEngine';
import { type AccountState, accountStore } from '@/features/account/accountStore';
import { reloadDataStores } from '@/features/dataStores';
import { type Clock, nowIso } from '@/lib/dates';
import { hasStoredSession, supabaseConfig } from '@/lib/supabase';

/**
 * - `off`: signed out (or the build has no login): nothing syncs.
 * - `pending`: some changes didn't go up (the server turned them down).
 * - `needsUpdate`: the server has records from a newer version of the app.
 */
export type SyncStatus = 'off' | 'syncing' | 'synced' | 'pending' | 'offline' | 'error' | 'needsUpdate';

export interface SyncState {
  status: SyncStatus;
  /** Changes here the server doesn't have yet, as of the last look. */
  pending: number;
  /** When the device last reached the server and synced. */
  lastSyncedAt: ISODateTime | null;
  /**
   * The account's part in each of its trips on the server, as of the last sync: `member` in one
   * shared with it. A trip not there (not uploaded, or signed out) is the device's own.
   */
  roles: Record<ID, TripRole>;
  /**
   * From now on, syncs the signed-in account's trips: on signing in, after edits, on reconnecting,
   * on coming back to the app, when the server says a trip changed, and every few minutes while
   * the app is in view. Once.
   */
  start: () => void;
  /** Syncs now, or once more right after the sync running. */
  syncNow: () => Promise<void>;
  /** Before signing out: sends what is waiting if it can; resolves to how many changes would be lost. */
  checkSignOut: () => Promise<number>;
  /** Takes a trip the account left off the device. */
  forgetTrip: (tripId: ID) => Promise<void>;
}

interface SyncStoreOptions {
  engine: SyncEngine;
  account: StoreApi<AccountState>;
  onLocalWrite: (listener: () => void) => () => void;
  /** After a sync changed the device's trips. */
  afterChange: () => Promise<void> | void;
  /** Hears of writes on the server as they happen (the device's own too). */
  watch?: (onChange: () => void) => Promise<() => void>;
  now?: Clock;
  /** Edits come in bursts: sync this long after the last one. */
  writeDelayMs?: number;
  /** Writes on the server come in bursts too. */
  serverDelayMs?: number;
  /** Other devices' changes show up this often while the app is in view. */
  pollMs?: number;
}

export function createSyncStore({
  engine,
  account,
  onLocalWrite: watchWrites,
  afterChange,
  watch,
  now = nowIso,
  writeDelayMs = 1500,
  serverDelayMs = 500,
  pollMs = 2 * 60 * 1000,
}: SyncStoreOptions) {
  let started = false;
  let running: Promise<void> | null = null;
  let again = false;
  let writeTimer: ReturnType<typeof setTimeout> | undefined;
  let serverTimer: ReturnType<typeof setTimeout> | undefined;
  /** Ends hearing from the server: the account's, while signed in. */
  let unwatch: Promise<() => void> | null = null;

  const signedIn = () => {
    const { status, account: who } = account.getState();
    return status === 'signedIn' && who ? who.id : null;
  };
  const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;

  return createStore<SyncState>()((set, get) => {
    async function run() {
      const userId = signedIn();
      if (!userId) {
        set({ status: 'off', pending: 0 });
        return;
      }
      if (!online()) {
        set({ status: 'offline', pending: await engine.pending(), roles: await engine.roles(userId) });
        return;
      }
      // The roles as last synced, while this sync gets the latest.
      set({ status: 'syncing', roles: await engine.roles(userId) });
      try {
        const outcome = await engine.sync(userId);
        const roles = await engine.roles(userId);
        if (signedIn() !== userId) return;
        set({
          status: outcome.needsUpdate ? 'needsUpdate' : outcome.pending > 0 ? 'pending' : 'synced',
          pending: outcome.pending,
          lastSyncedAt: now(),
          roles,
        });
        if (outcome.changed) await afterChange();
      } catch (error) {
        console.error(error);
        if (signedIn() !== userId) return;
        const pending = await engine.pending().catch(() => get().pending);
        set({ status: online() ? 'error' : 'offline', pending });
      }
    }

    function syncNow(): Promise<void> {
      if (running) {
        again = true;
        return running;
      }
      running = (async () => {
        do {
          again = false;
          await run();
        } while (again);
      })().finally(() => {
        running = null;
      });
      return running;
    }

    /**
     * Hears from the server while `userId` is signed in: a write brings a sync. The device's own
     * writes come back too (another device of the account can't be told apart): a pull of no news.
     */
    function listen(userId: string | null) {
      void unwatch?.then((stop) => stop());
      unwatch = null;
      if (!userId || !watch) return;
      unwatch = watch(() => {
        clearTimeout(serverTimer);
        serverTimer = setTimeout(() => void syncNow(), serverDelayMs);
      }).catch((error: unknown) => {
        console.error(error);
        return () => {};
      });
    }

    return {
      status: 'off',
      pending: 0,
      lastSyncedAt: null,
      roles: {},

      start() {
        if (started) return;
        started = true;
        let user = signedIn();
        account.subscribe(() => {
          if (signedIn() === user) return;
          user = signedIn();
          listen(user);
          if (user) void syncNow();
          else set({ status: 'off', pending: 0, lastSyncedAt: null, roles: {} });
        });
        watchWrites(() => {
          if (!signedIn()) return;
          clearTimeout(writeTimer);
          writeTimer = setTimeout(() => void syncNow(), writeDelayMs);
        });
        if (typeof window !== 'undefined') {
          window.addEventListener('online', () => void syncNow());
          window.addEventListener('offline', () => {
            if (signedIn()) set({ status: 'offline' });
          });
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') void syncNow();
          });
          // A computer's window comes to the front without becoming visible again.
          window.addEventListener('focus', () => void syncNow());
          setInterval(() => {
            if (document.visibilityState === 'visible' && signedIn()) void syncNow();
          }, pollMs);
        }
        listen(user);
        if (user) void syncNow();
      },

      syncNow,

      async checkSignOut() {
        if (online()) await syncNow();
        return engine.pending();
      },

      async forgetTrip(tripId) {
        await engine.forgetTrip(tripId);
        const userId = signedIn();
        set({ roles: userId ? await engine.roles(userId) : {} });
        await afterChange();
      },
    };
  });
}

export const syncStore = createSyncStore({
  engine: syncEngine,
  account: accountStore,
  onLocalWrite,
  afterChange: reloadDataStores,
  watch: watchServer,
});

export function useSyncStore<T>(selector: (state: SyncState) => T): T {
  return useStore(syncStore, selector);
}

/**
 * At app start: syncing follows the account. The login code loads now only when this browser
 * keeps a session (a first sign-in loads it on the account screen).
 */
export function startSync() {
  syncStore.getState().start();
  const config = supabaseConfig();
  if (config && hasStoredSession(config)) void accountStore.getState().load();
}
