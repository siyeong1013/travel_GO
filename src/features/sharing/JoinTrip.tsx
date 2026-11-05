import { useEffect, useEffectEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { connectSharing } from '@/data';
import type { ID } from '@/data/models';
import { myCompanion } from '@/data/rules/companion';
import type { InvitePreview } from '@/data/sharing/sharing';
import { LoginChoices } from '@/features/account/LoginSheet';
import { useAccountStore } from '@/features/account/accountStore';
import { expenseStore, useExpenseStore } from '@/features/expenses/expenseStore';
import { sharingErrorMessage, tripSummary } from '@/features/sharing/sharingDisplay';
import { WhoAmISheet } from '@/features/sharing/WhoAmISheet';
import { syncStore } from '@/features/sync/syncStore';
import { coverStyle } from '@/features/trips/tripCover';
import { useOnline } from '@/lib/useOnline';
import { supabaseConfig } from '@/lib/supabase';

/** `undefined`: still checking the link. */
type Preview = InvitePreview | null | undefined;

/**
 * Opening an invite link: what trip it is and who sent it, a login (back here) when signed out,
 * then "참여하기": the trip comes down to the device and they pick who they are in its ledger.
 */
export function JoinTrip({ token }: { token: string }) {
  const navigate = useNavigate();
  const [configured] = useState(() => supabaseConfig() !== null);
  const online = useOnline();
  const status = useAccountStore((state) => state.status);
  const account = useAccountStore((state) => state.account);
  const loadAccount = useAccountStore((state) => state.load);
  const companions = useExpenseStore((state) => state.companions);
  const [preview, setPreview] = useState<Preview>(undefined);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Joined: the trip whose ledger they pick themselves in. */
  const [picking, setPicking] = useState<ID | null>(null);

  // A login comes back here with `?code=`, which starting the account trades for a session.
  useEffect(() => {
    if (configured) void loadAccount();
  }, [configured, loadAccount]);

  const check = useEffectEvent((isLatest: () => boolean) => {
    connectSharing(null)
      .then((server) => server.preview(token))
      .then(
        (found) => {
          if (!isLatest()) return;
          setPreview(found);
          setFailed(false);
        },
        (err: unknown) => {
          console.error(err);
          if (isLatest()) setFailed(true);
        },
      );
  });

  useEffect(() => {
    if (!configured || !online) return;
    let latest = true;
    check(() => latest);
    return () => {
      latest = false;
    };
  }, [configured, online, token, attempt]);

  if (!configured || status === 'unavailable') {
    return <EmptyState title="로그인을 쓸 수 없어요" description="이 버전에는 로그인이 없어요." />;
  }
  if (preview === null) {
    return (
      <EmptyState
        title="이 초대 링크는 쓸 수 없어요"
        description="7일이 지났거나 링크가 끊겼어요. 초대한 사람에게 새 링크를 받아 주세요."
      />
    );
  }
  if (preview === undefined) {
    if (!online) {
      return <EmptyState title="인터넷에 연결되면 초대를 볼 수 있어요" />;
    }
    if (failed) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-16 text-center">
          <p className="text-base font-semibold text-gray-700">초대를 확인하지 못했어요</p>
          <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
            다시 시도
          </Button>
        </div>
      );
    }
    return <p className="px-4 py-6 text-gray-500">초대를 확인하고 있어요.</p>;
  }

  async function join() {
    if (!account || !preview) return;
    setJoining(true);
    setError(null);
    try {
      const joined = await (await connectSharing(account.id)).join(token);
      if (!joined) {
        setPreview(null);
        return;
      }
      // The trip comes down with the account's other trips.
      await syncStore.getState().syncNow();
      if (!syncStore.getState().roles[joined.tripId]) {
        throw new Error('the trip did not come down');
      }
      await expenseStore.getState().load(joined.tripId);
      const me = myCompanion(expenseStore.getState().companions, account.id, joined.role);
      if (joined.role === 'owner' || me) {
        void navigate(`/trips/${joined.tripId}`, { replace: true });
      } else {
        setPicking(joined.tripId);
      }
    } catch (err) {
      console.error(err);
      setError(
        navigator.onLine
          ? '여행을 받아 오지 못했어요. 잠시 후 다시 시도해 주세요.'
          : sharingErrorMessage(err),
      );
    } finally {
      setJoining(false);
    }
  }

  const checking = status === 'idle' || status === 'loading';
  return (
    <>
      <div className="px-4 pt-6 pb-8">
        <div
          className="rounded-3xl px-5 pt-16 pb-5 text-white"
          style={coverStyle({ id: preview.tripId })}
        >
          <p className="text-sm font-semibold opacity-90">
            {preview.inviter ? `${preview.inviter}님이 초대했어요` : '여행에 초대받았어요'}
          </p>
          <h2 className="mt-1 text-2xl font-bold break-keep">{preview.title}</h2>
          <p className="mt-1 text-sm opacity-90">{tripSummary(preview)}</p>
        </div>
        <p className="mt-5 text-sm leading-relaxed break-keep text-gray-600">
          참여하면 이 여행의 일정과 가계부를 같이 보고 고칠 수 있어요.
        </p>

        {checking ? (
          <p className="mt-6 text-gray-500">로그인 상태를 확인하고 있어요.</p>
        ) : account ? (
          <p className="mt-6 text-sm text-gray-500">
            <span className="font-semibold text-gray-800">{account.name}</span>(으)로 참여해요.
          </p>
        ) : (
          <div className="mt-6">
            <p className="mb-3 text-base font-semibold">로그인하고 참여해 주세요</p>
            <LoginChoices returnTo={`/join/${token}`} />
          </div>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-500">
            {error}
          </p>
        )}
      </div>

      {account && (
        <BottomActionBar>
          <Button block disabled={joining || picking !== null} onClick={() => void join()}>
            {joining ? '여행을 받아 오고 있어요' : '참여하기'}
          </Button>
        </BottomActionBar>
      )}

      {picking && account && (
        <WhoAmISheet
          tripId={picking}
          companions={companions}
          account={account}
          onDone={() => void navigate(`/trips/${picking}`, { replace: true })}
          // Later, from the trip's people screen.
          onClose={() => void navigate(`/trips/${picking}`, { replace: true })}
        />
      )}
    </>
  );
}
