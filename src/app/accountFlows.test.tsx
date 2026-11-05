/** @vitest-environment happy-dom */
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp, resetApp, resetStores, stubSupabase } from '@/test/app';
import { googleUser, kakaoUser, supabaseFake } from '@/test/supabase';

vi.mock('@/data', async () => (await import('@/test/fixtures')).createTestData());

vi.mock('@supabase/supabase-js', async () => {
  const { supabaseFake } = await import('@/test/supabase');
  return { createClient: () => supabaseFake.client };
});

beforeEach(async () => {
  await resetApp();
  supabaseFake.reset();
  window.history.replaceState(null, '', '/account');
});
afterEach(() => vi.restoreAllMocks());

/** A new page load at `address` (the login provider sending the page back, say). */
function reopen(address: string) {
  cleanup();
  resetStores();
  window.history.replaceState(null, '', address);
  return renderApp('/account');
}

/** Opens the Kakao / Google choice from the signed-out profile. */
async function openLogin(user: ReturnType<typeof renderApp>['user']) {
  await user.click(await screen.findByRole('button', { name: '로그인' }));
  return screen.findByRole('dialog', { name: '로그인' });
}

describe('account', () => {
  it('has no account button when the build has no login', async () => {
    renderApp('/');
    await screen.findByRole('link', { name: '설정' });
    expect(screen.queryByRole('link', { name: '계정' })).toBeNull();

    cleanup();
    renderApp('/account');
    expect(await screen.findByText('로그인을 쓸 수 없어요')).toBeInTheDocument();
  });

  it('opens the account screen from the trip list', async () => {
    stubSupabase();
    const { user } = renderApp('/');
    await user.click(await screen.findByRole('link', { name: '계정' }));
    expect(await screen.findByRole('heading', { level: 1, name: '계정' })).toBeInTheDocument();
    expect(await screen.findByText('로그인해 주세요')).toBeInTheDocument();
  });

  it('signs in with Kakao: off to Kakao, back to the account screen signed in', async () => {
    stubSupabase();
    const { user } = renderApp('/account');
    const sheet = await openLogin(user);
    await user.click(within(sheet).getByRole('button', { name: '카카오 로그인' }));
    expect(supabaseFake.signIns).toEqual([
      { provider: 'kakao', redirectTo: `${window.location.origin}/account` },
    ]);

    supabaseFake.returnsAs(kakaoUser('김여행'));
    reopen('/account?code=abc');
    expect(await screen.findByText('김여행')).toBeInTheDocument();
    expect(screen.getByText('카카오로 로그인했어요')).toBeInTheDocument();
    expect(screen.getByRole('main').querySelector('img')).toHaveAttribute(
      'src',
      'https://k.kakaocdn.net/dn/profile.jpg',
    );
    // The code is off the address.
    expect(window.location.search).toBe('');
  });

  it('shows who is signed in and signs out on this device only', async () => {
    stubSupabase();
    supabaseFake.signedIn(googleUser('Jane Doe'));
    const { user } = renderApp('/account');
    expect(await screen.findByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('Google로 로그인했어요')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '로그아웃' }));
    const sheet = await screen.findByRole('dialog', { name: '로그아웃할까요?' });
    expect(await within(sheet).findByText(/이 기기에서 여행이 지워져요/)).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: '로그아웃' }));
    await waitFor(() => expect(supabaseFake.signOuts).toEqual([{ scope: 'local' }]));
    expect(await screen.findByText('로그인해 주세요')).toBeInTheDocument();
    expect(screen.queryByText('Jane Doe')).toBeNull();
  });

  it('follows a sign-out in another tab', async () => {
    stubSupabase();
    supabaseFake.signedIn(kakaoUser('김여행'));
    renderApp('/account');
    await screen.findByText('김여행');
    supabaseFake.changeElsewhere(null);
    expect(await screen.findByText('로그인해 주세요')).toBeInTheDocument();
  });

  it('says so when the login was cancelled, and clears the address', async () => {
    stubSupabase();
    // As Supabase sends it: the error in the query and again in the fragment.
    const error = 'error=access_denied&error_description=User+denied+access';
    reopen(`/account?${error}#${error}&sb=`);
    expect(await screen.findByRole('alert')).toHaveTextContent('로그인을 취소했어요.');
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
  });

  it('says a login Supabase turned down failed', async () => {
    stubSupabase();
    const error = 'error=access_denied&error_code=user_banned&error_description=User+is+banned';
    reopen(`/account?${error}#${error}&sb=`);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '로그인하지 못했어요. 잠시 후 다시 시도해 주세요.',
    );
    expect(window.location.href).toBe(`${window.location.origin}/account`);
  });

  it('says a returned login failed when its code went unused', async () => {
    stubSupabase();
    // No login was waiting for this code here (it began in another browser).
    reopen('/account?code=abc');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '로그인하지 못했어요. 잠시 후 다시 시도해 주세요.',
    );
    expect(window.location.search).toBe('');
  });

  it('needs a connection to sign in', async () => {
    stubSupabase();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { user } = renderApp('/account');
    const sheet = await openLogin(user);
    await user.click(within(sheet).getByRole('button', { name: '카카오 로그인' }));
    expect(within(sheet).getByRole('alert')).toHaveTextContent('인터넷에 연결되면 로그인할 수 있어요.');
    expect(supabaseFake.signIns).toEqual([]);
  });

  it('in KakaoTalk, turns Google off and offers the phone browser', async () => {
    stubSupabase();
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 25.9.0',
    );
    const { user } = renderApp('/account');
    const sheet = await openLogin(user);
    expect(within(sheet).getByRole('button', { name: 'Google 계정으로 로그인' })).toBeDisabled();
    expect(within(sheet).getByRole('button', { name: '카카오 로그인' })).toBeEnabled();
    expect(within(sheet).getByRole('link', { name: '다른 브라우저로 열기' })).toHaveAttribute(
      'href',
      `kakaotalk://web/openExternal?url=${encodeURIComponent(window.location.href)}`,
    );
  });
});
