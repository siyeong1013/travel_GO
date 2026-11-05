/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from 'vitest';
import type { Account, LoginError } from '@/features/account/account';
import { createAccountStore } from '@/features/account/accountStore';
import type { Auth } from '@/features/account/auth';

const JANE: Account = { id: 'u1', name: 'Jane', avatarUrl: null, provider: 'google' };

/** An `Auth` that starts as `account` (and reports `error`), with its listener exposed. */
function fakeAuth(account: Account | null = null, error: LoginError | null = null) {
  let listener: (account: Account | null) => void = () => {};
  const auth = {
    start: vi.fn(async () => ({ account, error })),
    onChange: vi.fn((next: (account: Account | null) => void) => {
      listener = next;
      return () => {};
    }),
    signIn: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
  } satisfies Auth;
  return { auth, changeElsewhere: (next: Account | null) => listener(next) };
}

describe('accountStore', () => {
  it('is unavailable when the build has no login', async () => {
    const store = createAccountStore(() => null);
    await store.getState().load();
    expect(store.getState().status).toBe('unavailable');
  });

  it('starts once, with the account and how a returned login ended', async () => {
    const { auth } = fakeAuth(JANE, 'cancelled');
    const store = createAccountStore(() => auth);
    await Promise.all([store.getState().load(), store.getState().load()]);
    await store.getState().load();
    expect(auth.start).toHaveBeenCalledTimes(1);
    expect(store.getState()).toMatchObject({ status: 'signedIn', account: JANE, loginError: 'cancelled' });
  });

  it('follows signing in and out elsewhere', async () => {
    const { auth, changeElsewhere } = fakeAuth();
    const store = createAccountStore(() => auth);
    await store.getState().load();
    expect(store.getState().status).toBe('signedOut');
    changeElsewhere(JANE);
    expect(store.getState()).toMatchObject({ status: 'signedIn', account: JANE });
    changeElsewhere(null);
    expect(store.getState()).toMatchObject({ status: 'signedOut', account: null });
  });

  it('signs in through the provider, back to the account screen', async () => {
    const { auth } = fakeAuth(null, 'failed');
    const store = createAccountStore(() => auth);
    await store.getState().load();
    await store.getState().signIn('kakao');
    expect(auth.signIn).toHaveBeenCalledWith('kakao', `${window.location.origin}/account`);
    expect(store.getState().loginError).toBeNull();
  });

  it('signs out', async () => {
    const { auth } = fakeAuth(JANE);
    const store = createAccountStore(() => auth);
    await store.getState().load();
    await store.getState().signOut();
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(store.getState()).toMatchObject({ status: 'signedOut', account: null });
  });

  it('shows signed out when starting fails', async () => {
    const { auth } = fakeAuth();
    auth.start.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = createAccountStore(() => auth);
    await store.getState().load();
    expect(store.getState()).toMatchObject({ status: 'signedOut', loginError: 'failed' });
  });
});
