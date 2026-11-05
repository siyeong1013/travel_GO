import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand';
import type { SyncEngine, SyncOutcome } from '@/data/sync/syncEngine';
import type { Account } from '@/features/account/account';
import type { AccountState } from '@/features/account/accountStore';
import { createSyncStore } from '@/features/sync/syncStore';
import { T0, testClock } from '@/test/fixtures';

const ME: Account = { id: 'user-1', name: '김여행', avatarUrl: null, provider: 'kakao' };
const DONE: SyncOutcome = { changed: false, pending: 0, needsUpdate: false };

function setup(outcome: () => Promise<SyncOutcome> = async () => DONE) {
  const account = createStore<AccountState>()(() => ({
    status: 'signedOut',
    account: null,
    loginError: null,
    load: async () => {},
    signIn: async () => {},
    signOut: async () => {},
  }));
  const engine = {
    sync: vi.fn<SyncEngine['sync']>(outcome),
    pending: vi.fn<SyncEngine['pending']>(async () => 3),
    roles: vi.fn<SyncEngine['roles']>(async () => ({ 'trip-1': 'member' })),
    forgetTrip: vi.fn<SyncEngine['forgetTrip']>(async () => {}),
    forget: vi.fn<SyncEngine['forget']>(async () => {}),
  };
  let write = () => {};
  const server: { hear: () => void; stopped: number } = {
    hear: () => {},
    stopped: 0,
  };
  const afterChange = vi.fn();
  const store = createSyncStore({
    engine,
    account,
    onLocalWrite: (listener) => {
      write = listener;
      return () => {};
    },
    afterChange,
    watch: async (onChange) => {
      server.hear = onChange;
      return () => {
        server.hear = () => {};
        server.stopped += 1;
      };
    },
    now: testClock(),
    writeDelayMs: 10,
    serverDelayMs: 10,
  });
  const signIn = () => account.setState({ status: 'signedIn', account: ME });
  return { store, engine, account, afterChange, signIn, server, write: () => write() };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

afterEach(() => vi.unstubAllGlobals());

describe('syncStore', () => {
  it('does nothing while signed out', async () => {
    const { store, engine } = setup();
    store.getState().start();
    await store.getState().syncNow();
    expect(engine.sync).not.toHaveBeenCalled();
    expect(store.getState().status).toBe('off');
  });

  it('syncs on signing in, and has the screens read the trips again when they changed', async () => {
    const { store, engine, afterChange, signIn } = setup(async () => ({ ...DONE, changed: true }));
    store.getState().start();
    signIn();
    await settle();
    expect(engine.sync).toHaveBeenCalledWith('user-1');
    expect(store.getState()).toMatchObject({
      status: 'synced',
      pending: 0,
      roles: { 'trip-1': 'member' },
      rolesOf: 'user-1',
    });
    expect(store.getState().lastSyncedAt).not.toBe(T0);
    expect(afterChange).toHaveBeenCalledTimes(1);
  });

  it('says what is left over, and when the app needs updating', async () => {
    const { store, signIn } = setup(async () => ({ ...DONE, pending: 2 }));
    signIn();
    await store.getState().syncNow();
    expect(store.getState()).toMatchObject({ status: 'pending', pending: 2 });

    const newer = setup(async () => ({ ...DONE, needsUpdate: true }));
    newer.signIn();
    await newer.store.getState().syncNow();
    expect(newer.store.getState().status).toBe('needsUpdate');
  });

  it('waits for a connection, and says when the server didn’t answer', async () => {
    const { store, engine, signIn } = setup(async () => {
      throw new Error('500');
    });
    signIn();
    vi.stubGlobal('navigator', { onLine: false });
    await store.getState().syncNow();
    expect(engine.sync).not.toHaveBeenCalled();
    expect(store.getState()).toMatchObject({ status: 'offline', pending: 3 });

    vi.stubGlobal('navigator', { onLine: true });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await store.getState().syncNow();
    expect(store.getState()).toMatchObject({ status: 'error', pending: 3 });
  });

  it('syncs a moment after edits, once for a burst', async () => {
    const { store, engine, signIn, write } = setup();
    store.getState().start();
    signIn();
    await settle();
    write();
    write();
    write();
    await settle();
    expect(engine.sync).toHaveBeenCalledTimes(2);
  });

  it('runs once more when asked during a sync', async () => {
    let finish = () => {};
    const { store, engine, signIn } = setup(
      () => new Promise((resolve) => (finish = () => resolve(DONE))),
    );
    signIn();
    const first = store.getState().syncNow();
    void store.getState().syncNow();
    void store.getState().syncNow();
    await vi.waitFor(() => expect(engine.sync).toHaveBeenCalledTimes(1));
    finish();
    await vi.waitFor(() => expect(engine.sync).toHaveBeenCalledTimes(2));
    finish();
    await first;
    expect(engine.sync).toHaveBeenCalledTimes(2);
  });

  it('before signing out, sends what is waiting and counts what is left', async () => {
    const { store, engine, signIn } = setup();
    signIn();
    expect(await store.getState().checkSignOut()).toBe(3);
    expect(engine.sync).toHaveBeenCalledTimes(1);
  });

  it('stops when signed out', async () => {
    const { store, account, signIn, server } = setup();
    store.getState().start();
    signIn();
    await settle();
    account.setState({ status: 'signedOut', account: null });
    expect(store.getState()).toMatchObject({
      status: 'off',
      pending: 0,
      lastSyncedAt: null,
      roles: {},
      rolesOf: null,
    });
    await settle();
    expect(server.stopped).toBe(1);
  });

  it('syncs when the server says a trip changed, once for a burst', async () => {
    const { store, engine, signIn, server } = setup();
    store.getState().start();
    signIn();
    await settle();
    expect(engine.sync).toHaveBeenCalledTimes(1);

    server.hear();
    server.hear();
    server.hear();
    await settle();
    expect(engine.sync).toHaveBeenCalledTimes(2);
  });

  it('takes a trip it left off the device, and has the screens read the trips again', async () => {
    const { store, engine, afterChange, signIn } = setup();
    signIn();
    await store.getState().forgetTrip('trip-1');
    expect(engine.forgetTrip).toHaveBeenCalledWith('trip-1');
    expect(afterChange).toHaveBeenCalledTimes(1);
    expect(store.getState().roles).toEqual({ 'trip-1': 'member' });
  });
});
