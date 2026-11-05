/** @vitest-environment happy-dom */
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { repositories, syncEngine } from '@/data';
import type { NewTrip } from '@/data/repositories';
import { createTestData, typedCity } from '@/test/fixtures';
import { renderApp, resetApp, resetStores, stubSupabase } from '@/test/app';
import { googleUser, kakaoUser, supabaseFake, USER_IDS } from '@/test/supabase';
import type { SyncDatabase } from '@/test/syncDatabase';

// Sharing a trip: the owner's invite link, a friend joining through it, leaving and taking out.
// The server is the real SQL on PGlite; the owner signs in with Kakao (김여행), the friend with
// Google (Jane Doe).

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
const OWNER = USER_IDS.kakao;
const FRIEND = USER_IDS.google;
const OSAKA: NewTrip = {
  title: 'Osaka',
  city: typedCity('Osaka'),
  startDate: '2026-12-01',
  endDate: '2026-12-03',
};

beforeEach(async () => {
  await resetApp();
  await syncEngine.forget();
  supabaseFake.reset();
  await server().reset();
  await server().addUser(OWNER, kakaoUser().user_metadata);
  await server().addUser(FRIEND, googleUser().user_metadata);
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

/**
 * The owner's trip, made on another device of theirs: "나" named 김여행 (theirs) and 민수 in the
 * ledger, on the server with an invite link.
 */
async function ownersTrip() {
  const laptop = createTestData(server());
  const trip = await laptop.repositories.trips.create(OSAKA);
  const [me] = await laptop.repositories.companions.listByTrip(trip.id);
  await laptop.repositories.companions.rename(me!.id, '김여행');
  await laptop.repositories.companions.claim(me!.id, OWNER);
  await laptop.repositories.companions.create({ tripId: trip.id, name: '민수' });
  await laptop.syncEngine.sync(OWNER);
  await laptop.db.delete();
  const { token } = await server().sharingFor(OWNER).createInvite(trip.id);
  return { trip, token };
}

describe('sharing a trip', () => {
  it('has the owner name themselves, then make, copy and cut the invite link', async () => {
    const trip = await repositories.trips.create(OSAKA);
    supabaseFake.signedIn(kakaoUser());
    const { user } = renderApp(`/trips/${trip.id}/people`);

    const make = await screen.findByRole('button', { name: '초대 링크 만들기' });
    await waitFor(() => expect(make).toBeEnabled(), synced);
    await user.click(make);
    const sheet = await screen.findByRole('dialog', { name: '친구들에게 보일 내 이름' });
    expect(within(sheet).getByLabelText('이름')).toHaveValue('김여행');
    await user.click(within(sheet).getByRole('button', { name: '저장하고 초대 링크 만들기' }));

    const link = await screen.findByText(/\/join\/[\w-]{22}$/, {}, synced);
    expect(screen.getByText(/까지 쓸 수 있어요\.$/)).toBeInTheDocument();
    // Friends see the owner by name; it's the owner's own.
    expect((await repositories.companions.listByTrip(trip.id))[0]).toMatchObject({
      name: '김여행',
      accountId: OWNER,
    });

    await user.click(screen.getByRole('button', { name: '링크 복사' }));
    expect(await navigator.clipboard.readText()).toBe(link.textContent);
    expect(await screen.findByText('초대 링크를 복사했어요. 친구에게 보내 주세요.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '링크 끊기' }));
    const confirm = await screen.findByRole('dialog', { name: '초대 링크를 끊을까요?' });
    await user.click(within(confirm).getByRole('button', { name: '끊기' }));
    expect(await screen.findByRole('button', { name: '초대 링크 만들기' })).toBeInTheDocument();
    expect(await server().sharingFor(OWNER).currentInvite(trip.id)).toBeNull();
  });

  it('lets a friend open the link, sign in, join, and pick who they are in the ledger', async () => {
    const { trip, token } = await ownersTrip();
    const { user } = renderApp(`/join/${token}`);

    expect(await screen.findByText('김여행님이 초대했어요', {}, synced)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Osaka' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Google 계정으로 로그인' }));
    expect(supabaseFake.signIns.at(-1)).toEqual({
      provider: 'google',
      redirectTo: `${window.location.origin}/join/${token}`,
    });

    supabaseFake.returnsAs(googleUser());
    const back = reopen(`/join/${token}?code=abc`);
    await back.user.click(await screen.findByRole('button', { name: '참여하기' }, synced));
    const sheet = await screen.findByRole('dialog', { name: '가계부에서 누가 나예요?' }, synced);
    // The owner is theirs.
    expect(within(sheet).queryByRole('button', { name: '김여행' })).toBeNull();
    await back.user.click(within(sheet).getByRole('button', { name: '민수' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Osaka' })).toBeInTheDocument();
    const companions = await repositories.companions.listByTrip(trip.id);
    expect(companions.find((c) => c.name === '민수')?.accountId).toBe(FRIEND);
  });

  it('says when a link doesn’t work', async () => {
    renderApp('/join/not-a-link');
    expect(await screen.findByText('이 초대 링크는 쓸 수 없어요', {}, synced)).toBeInTheDocument();
  });

  it('shows a member who is in the trip, keeps deleting to the owner, and lets them leave', async () => {
    const { trip, token } = await ownersTrip();
    await server().sharingFor(FRIEND).join(token);
    supabaseFake.signedIn(googleUser());
    const { user } = renderApp(`/trips/${trip.id}`);

    await user.click(await screen.findByRole('button', { name: '여행 메뉴' }, synced));
    const menu = await screen.findByRole('dialog', { name: '여행 관리' });
    expect(within(menu).queryByRole('button', { name: '여행 삭제' })).toBeNull();
    await user.click(within(menu).getByRole('button', { name: '함께하는 사람' }));

    const people = await screen.findByRole('region', { name: '함께하는 사람' });
    expect(await within(people).findByText('김여행', {}, synced)).toBeInTheDocument();
    expect(within(people).getByText('만든 사람')).toBeInTheDocument();
    expect(within(people).getByText('Jane Doe')).toBeInTheDocument();
    expect(within(people).queryByRole('button', { name: /내보내기$/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: '이 여행에서 나가기' }));
    const confirm = await screen.findByRole('dialog', { name: '이 여행에서 나갈까요?' });
    await user.click(within(confirm).getByRole('button', { name: '나가기' }));
    expect(await screen.findByText('아직 여행이 없어요', {}, synced)).toBeInTheDocument();
    expect(await repositories.trips.list()).toEqual([]);
    expect(await server().serverFor(FRIEND).memberships()).toEqual([]);
  });

  it('lets the owner take a friend out', async () => {
    const { trip, token } = await ownersTrip();
    await server().sharingFor(FRIEND).join(token);
    supabaseFake.signedIn(kakaoUser());
    const { user } = renderApp(`/trips/${trip.id}/people`);

    await user.click(await screen.findByRole('button', { name: 'Jane Doe 내보내기' }, synced));
    const confirm = await screen.findByRole('dialog', { name: 'Jane Doe님을 내보낼까요?' });
    await user.click(within(confirm).getByRole('button', { name: '내보내기' }));
    await waitFor(() => expect(screen.queryByText('Jane Doe')).toBeNull());
    expect(await server().serverFor(FRIEND).memberships()).toEqual([]);
  });
});
