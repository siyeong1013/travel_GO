/** @vitest-environment happy-dom */
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { repositories, syncEngine } from '@/data';
import type { NewTrip } from '@/data/repositories';
import { createTestData, typedCity } from '@/test/fixtures';
import { renderApp, resetApp, resetStores, stubSupabase } from '@/test/app';
import { kakaoUser, supabaseFake, USER_IDS } from '@/test/supabase';
import type { SyncDatabase } from '@/test/syncDatabase';

// The account's trips on the server (the real SQL, on PGlite) and on this device.
const shared = vi.hoisted(() => ({ server: null as SyncDatabase | null }));

vi.mock('@/data', async () => {
  const { createTestData } = await import('@/test/fixtures');
  const { createSyncDatabase } = await import('@/test/syncDatabase');
  shared.server = await createSyncDatabase();
  return createTestData(shared.server);
});

vi.mock('@supabase/supabase-js', async () => {
  const { supabaseFake } = await import('@/test/supabase');
  return { createClient: () => supabaseFake.client };
});

const server = () => shared.server!;
const synced = { timeout: 3000 };
const OSAKA: NewTrip = {
  title: 'Osaka',
  cities: [typedCity('Osaka')],
  startDate: '2026-12-01',
  endDate: '2026-12-03',
};

beforeEach(async () => {
  await resetApp();
  await syncEngine.forget();
  supabaseFake.reset();
  await server().reset();
  await server().addUser(USER_IDS.kakao);
  window.history.replaceState(null, '', '/');
  stubSupabase();
});
afterEach(() => vi.restoreAllMocks());

/** A new page load at `address` (the login provider sending the page back, say). */
function reopen(address: string) {
  cleanup();
  resetStores();
  window.history.replaceState(null, '', address);
  return renderApp(address);
}

async function serverKinds() {
  const { rows } = await server().as(USER_IDS.kakao, (tx) =>
    tx.query<{ kind: string }>('select kind from public.records where not deleted order by seq'),
  );
  return rows.map((row) => row.kind);
}

describe('sync', () => {
  it('puts the trips on the account when signed in, and says so', async () => {
    await repositories.trips.create(OSAKA);
    supabaseFake.signedIn(kakaoUser());
    renderApp('/account');

    expect(await screen.findByText('모든 여행을 서버에 저장했어요.', {}, synced)).toBeInTheDocument();
    expect(await serverKinds()).toEqual(['trip', 'companion']);
  });

  it('shows a trip made on another device', async () => {
    const laptop = createTestData(server());
    await laptop.repositories.trips.create({ ...OSAKA, title: '삿포로' });
    await laptop.syncEngine.sync(USER_IDS.kakao);
    await laptop.db.delete();

    supabaseFake.signedIn(kakaoUser());
    renderApp('/');
    expect(await screen.findByText('삿포로', {}, synced)).toBeInTheDocument();
  });

  it('asks before signing out, takes the trips off the device, and brings them back on signing in', async () => {
    await repositories.trips.create(OSAKA);
    supabaseFake.signedIn(kakaoUser());
    const { user } = renderApp('/account');
    await screen.findByText('모든 여행을 서버에 저장했어요.', {}, synced);

    await user.click(screen.getByRole('button', { name: '로그아웃' }));
    const sheet = await screen.findByRole('dialog', { name: '로그아웃할까요?' });
    expect(
      await within(sheet).findByText(
        '이 기기에서 여행이 지워져요. 같은 계정으로 다시 로그인하면 그대로 돌아와요.',
      ),
    ).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: '로그아웃' }));
    expect(await screen.findByText('로그인해 주세요')).toBeInTheDocument();
    expect(await repositories.trips.list()).toEqual([]);

    supabaseFake.returnsAs(kakaoUser());
    reopen('/account?code=abc');
    await screen.findByText('모든 여행을 서버에 저장했어요.', {}, synced);
    expect((await repositories.trips.list()).map((trip) => trip.title)).toEqual(['Osaka']);
  });

  it('warns before signing out with changes the server doesn’t have', async () => {
    await repositories.trips.create(OSAKA);
    supabaseFake.signedIn(kakaoUser());
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { user } = renderApp('/account');
    expect(
      await screen.findByText('인터넷에 연결되면 변경 2개를 서버에 올려요.', {}, synced),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '로그아웃' }));
    const sheet = await screen.findByRole('dialog', { name: '로그아웃할까요?' });
    expect(
      await within(sheet).findByText(
        '서버에 아직 올리지 못한 변경이 2개 있어요. 지금 로그아웃하면 이 변경은 사라져요.',
      ),
    ).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: '취소' }));
    expect(await repositories.trips.list()).toHaveLength(1);
  });
});
