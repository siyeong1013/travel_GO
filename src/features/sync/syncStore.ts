import { createStore, type StoreApi, useStore } from 'zustand';
import { onLocalWrite, syncEngine } from '@/data';
import type { ISODateTime } from '@/data/models';
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
   * From now on, syncs the signed-in account's trips: on signing in, after edits, on reconnecting,
   * on coming back to the app and every few minutes while it is in view. Once.
   */
  start: () => void;
  /** Syncs now, or once more right after the sync running. */
  syncNow: () => Promise<void>;
  /** Before signing out: sends what is waiting if it can; resolves to how many changes would be lost. */
  checkSignOut: () => Promise<number>;
}

interface SyncStoreOptions {
  engine: SyncEngine;
  account: StoreApi<AccountState>;
  onLocalWrite: (listener: () => void) => () => void;
  /** After a sync changed the device's trips. */
  afterChange: () => Promise<void> | void;
  now?: Clock;
  /** Edits come in bursts: sync this long after the last one. */
  writeDelayMs?: number;
  /** Other devices' changes show up this often while the app is in view. */
  pollMs?: number;
}

export function createSyncStore({
  engine,
  account,
  onLocalWrite: watchWrites,
  afterChange,
  now = nowIso,
  writeDelayMs = 1500,
  pollMs = 2 * 60 * 1000,
}: SyncStoreOptions) {
  let started = false;
  let running: Promise<void> | null = null;
  let again = false;
  let writeTimer: ReturnType<typeof setTimeout> | undefined;

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
        set({ status: 'offline', pending: await engine.pending() });
        return;
      }
      set({ status: 'syncing' });
      try {
        const outcome = await engine.sync(userId);
        if (signedIn() !== userId) return;
        set({
          status: outcome.needsUpdate ? 'needsUpdate' : outcome.pending > 0 ? 'pending' : 'synced',
          pending: outcome.pending,
          lastSyncedAt: now(),
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

    return {
      status: 'off',
      pending: 0,
      lastSyncedAt: null,

      start() {
        if (started) return;
        started = true;
        let user = signedIn();
        account.subscribe(() => {
          if (signedIn() === user) return;
          user = signedIn();
          if (user) void syncNow();
          else set({ status: 'off', pending: 0, lastSyncedAt: null });
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
        if (user) void syncNow();
      },

      syncNow,

      async checkSignOut() {
        if (online()) await syncNow();
        return engine.pending();
      },
    };
  });
}

export const syncStore = createSyncStore({
  engine: syncEngine,
  account: accountStore,
  onLocalWrite,
  afterChange: reloadDataStores,
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
