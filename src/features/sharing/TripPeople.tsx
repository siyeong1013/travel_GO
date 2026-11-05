import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSection, sectionActionClass } from '@/components/ui/PageSection';
import { Snackbar } from '@/components/ui/Snackbar';
import type { Companion, Trip } from '@/data/models';
import { ME_NAME, myCompanion } from '@/data/rules/companion';
import type { TripPerson } from '@/data/sharing/sharing';
import type { Account } from '@/features/account/account';
import { kakaoButtonClass, KakaoSymbol } from '@/features/account/LoginButtons';
import { LoginChoices } from '@/features/account/LoginSheet';
import { useAccountStore } from '@/features/account/accountStore';
import { useExpenseStore } from '@/features/expenses/expenseStore';
import { CopyTextSheet } from '@/features/settlement/CopyTextSheet';
import { MyNameSheet } from '@/features/sharing/MyNameSheet';
import {
  inviteExpiry,
  inviteMessage,
  inviteUrl,
  sharingErrorMessage,
  tripSummary,
} from '@/features/sharing/sharingDisplay';
import { useSharingStore } from '@/features/sharing/sharingStore';
import { ledgerAccount, useAccountInLedger } from '@/features/sharing/useMyCompanion';
import { WhoAmISheet } from '@/features/sharing/WhoAmISheet';
import { useSyncStore } from '@/features/sync/syncStore';
import { kakaoJavaScriptKey, loadedKakao, loadKakao, sendKakaoCard } from '@/lib/kakaoShare';
import { canShare, copyText, shareText } from '@/lib/share';
import { supabaseConfig } from '@/lib/supabase';

const NO_COMPANIONS: Companion[] = [];

/**
 * Who is in a trip and how friends join it: the people (the owner can take someone out, a member
 * can leave), the owner's invite link (KakaoTalk, share sheet, copy; cut), and who the person using
 * the app is in the ledger. Needs a login; says so without one.
 */
export function TripPeople({ trip }: { trip: Trip }) {
  const [configured] = useState(() => supabaseConfig() !== null);
  const status = useAccountStore((state) => state.status);
  const account = useAccountStore((state) => state.account);
  const load = useAccountStore((state) => state.load);

  useEffect(() => {
    if (configured) void load();
  }, [configured, load]);

  if (!configured || status === 'unavailable') {
    return <EmptyState title="로그인을 쓸 수 없어요" description="이 버전에는 로그인이 없어요." />;
  }
  if (status === 'idle' || status === 'loading') {
    return <p className="px-4 py-6 text-gray-500">로그인 상태를 확인하고 있어요.</p>;
  }
  if (!account) {
    return (
      <div className="px-4 pt-6 pb-8">
        <p className="rounded-2xl bg-gray-50 px-4 py-3 text-sm leading-relaxed break-keep text-gray-600">
          로그인하면 친구를 초대해서 이 여행의 일정과 가계부를 같이 보고 고칠 수 있어요.
        </p>
        <div className="mt-5">
          <LoginChoices returnTo={`/trips/${trip.id}/people`} />
        </div>
      </div>
    );
  }
  return <SharedTrip trip={trip} account={account} />;
}

function SharedTrip({ trip, account }: { trip: Trip; account: Account }) {
  const navigate = useNavigate();
  const role = useSyncStore((state) => state.roles[trip.id]);
  const owner = role !== 'member';
  const loadPeople = useSharingStore((state) => state.load);
  const sharingTripId = useSharingStore((state) => state.tripId);
  const status = useSharingStore((state) => state.status);
  const people = useSharingStore((state) => state.people);
  const leave = useSharingStore((state) => state.leave);
  const removeMember = useSharingStore((state) => state.removeMember);
  const loadLedger = useExpenseStore((state) => state.load);
  const companions = useExpenseStore((state) =>
    state.tripId === trip.id ? state.companions : NO_COMPANIONS,
  );
  // Who "나" is decides whether inviting asks for a name first.
  const ledgerReady = useExpenseStore((state) => state.tripId === trip.id && state.status === 'ready');
  const me = myCompanion(companions, account.id, role);
  const [picking, setPicking] = useState(false);
  const [removing, setRemoving] = useState<TripPerson | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadPeople(trip.id);
    // Again once the trip is uploaded, or the account's part in it changes.
  }, [trip.id, role, loadPeople]);
  useEffect(() => {
    void loadLedger(trip.id);
  }, [trip.id, loadLedger]);
  useAccountInLedger(trip.id);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      console.error(err);
      setError(sharingErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const shown = sharingTripId === trip.id ? people : [];
  return (
    <>
      <PageSection
        title="함께하는 사람"
        description={role ? undefined : '아직 나만 있어요. 초대 링크를 보내면 친구가 함께할 수 있어요.'}
      >
        {role ? (
          <PeopleList
            status={sharingTripId === trip.id ? status : 'loading'}
            people={shown}
            account={account}
            canRemove={owner}
            onRemove={(person) => {
              setError(null);
              setRemoving(person);
            }}
            onRetry={() => void loadPeople(trip.id)}
          />
        ) : (
          <ul>
            <PersonRow name={account.name} avatarUrl={account.avatarUrl} owner mine />
          </ul>
        )}
      </PageSection>

      {owner && (
        <InviteSection
          trip={trip}
          account={account}
          me={me}
          companions={companions}
          ready={ledgerReady}
        />
      )}

      {role && (
        <PageSection
          title="가계부에서 나"
          action={
            companions.length > 0 && (
              <button type="button" className={sectionActionClass} onClick={() => setPicking(true)}>
                {me ? '바꾸기' : '고르기'}
              </button>
            )
          }
        >
          <p className="text-base">
            {me ? (
              <>
                <span className="font-semibold">{me.name}</span>
                <span className="text-gray-500"> · 지출을 기록할 때 먼저 결제한 사람이 돼요.</span>
              </>
            ) : (
              <span className="text-gray-500">아직 고르지 않았어요.</span>
            )}
          </p>
        </PageSection>
      )}

      {role === 'member' && (
        <div className="px-4 py-6">
          <Button
            variant="secondary"
            block
            className="text-red-600"
            onClick={() => {
              setError(null);
              setLeaving(true);
            }}
          >
            이 여행에서 나가기
          </Button>
        </div>
      )}

      {picking && (
        <WhoAmISheet
          tripId={trip.id}
          companions={companions}
          account={account}
          onDone={() => setPicking(false)}
          onClose={() => setPicking(false)}
        />
      )}
      <ConfirmSheet
        open={removing !== null}
        title={`${removing?.name ?? '이 사람'}님을 내보낼까요?`}
        description="이 사람의 기기에서 이 여행이 지워져요. 가계부의 기록은 그대로 남고, 다시 초대할 수 있어요."
        confirmLabel="내보내기"
        tone="danger"
        busy={busy}
        error={error}
        onConfirm={() =>
          void run(async () => {
            if (removing) await removeMember(trip.id, removing.userId);
            setRemoving(null);
          })
        }
        onClose={() => setRemoving(null)}
      />
      <ConfirmSheet
        open={leaving}
        title="이 여행에서 나갈까요?"
        description="내 기기들에서 이 여행이 지워져요. 다시 함께하려면 초대 링크가 필요해요."
        confirmLabel="나가기"
        tone="danger"
        busy={busy}
        error={error}
        onConfirm={() =>
          void run(async () => {
            await leave(trip.id);
            void navigate('/', { replace: true });
          })
        }
        onClose={() => setLeaving(false)}
      />
    </>
  );
}

function PeopleList({
  status,
  people,
  account,
  canRemove,
  onRemove,
  onRetry,
}: {
  status: string;
  people: TripPerson[];
  account: Account;
  canRemove: boolean;
  onRemove: (person: TripPerson) => void;
  onRetry: () => void;
}) {
  if (people.length === 0) {
    if (status === 'offline') {
      return <p className="text-sm text-gray-500">인터넷에 연결되면 볼 수 있어요.</p>;
    }
    if (status === 'error') {
      return (
        <p className="text-sm text-gray-500">
          불러오지 못했어요.{' '}
          <button type="button" onClick={onRetry} className="font-semibold text-brand-600 underline">
            다시 시도
          </button>
        </p>
      );
    }
    return <p className="text-sm text-gray-500">불러오고 있어요.</p>;
  }
  return (
    <ul className="divide-y divide-gray-100">
      {people.map((person) => {
        const mine = person.userId === account.id;
        // The account's own name and photo are the freshest.
        const name = mine ? account.name : (person.name ?? '이름 없음');
        return (
          <PersonRow
            key={person.userId}
            name={name}
            avatarUrl={mine ? account.avatarUrl : person.avatarUrl}
            owner={person.role === 'owner'}
            mine={mine}
            onRemove={canRemove && !mine ? () => onRemove({ ...person, name }) : undefined}
          />
        );
      })}
    </ul>
  );
}

function PersonRow({
  name,
  avatarUrl,
  owner,
  mine,
  onRemove,
}: {
  name: string;
  avatarUrl: string | null;
  owner: boolean;
  mine: boolean;
  onRemove?: () => void;
}) {
  return (
    <li className="flex min-h-14 items-center gap-3 py-1">
      <Avatar name={name} url={avatarUrl} />
      <span className="min-w-0 truncate text-base font-medium">{name}</span>
      {mine && (
        <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-600">
          나
        </span>
      )}
      {owner && <span className="shrink-0 text-xs text-gray-500">만든 사람</span>}
      <span className="flex-1" />
      {onRemove && (
        <button
          type="button"
          aria-label={`${name} 내보내기`}
          onClick={onRemove}
          className="-mr-2 flex h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-red-600 active:bg-red-50"
        >
          내보내기
        </button>
      )}
    </li>
  );
}

/**
 * The owner's invite link: make it, send it (KakaoTalk, share sheet, copy), cut it. Making one
 * waits for the ledger (`ready`), which tells whether "나" needs a name first.
 */
function InviteSection({
  trip,
  account,
  me,
  companions,
  ready,
}: {
  trip: Trip;
  account: Account;
  me: Companion | undefined;
  companions: Companion[];
  ready: boolean;
}) {
  const sharingTripId = useSharingStore((state) => state.tripId);
  const invite = useSharingStore((state) => (state.tripId === trip.id ? state.invite : null));
  const status = useSharingStore((state) => state.status);
  const createInvite = useSharingStore((state) => state.createInvite);
  const revokeInvite = useSharingStore((state) => state.revokeInvite);
  const renameCompanion = useExpenseStore((state) => state.renameCompanion);
  const claimCompanion = useExpenseStore((state) => state.claimCompanion);
  const [kakaoKey] = useState(() => kakaoJavaScriptKey());
  const [naming, setNaming] = useState(false);
  const [cutting, setCutting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: number; message: string } | null>(null);
  const [manualCopy, setManualCopy] = useState<string | null>(null);
  const url = invite ? inviteUrl(invite.token) : null;

  // Ready before the tap: KakaoTalk share has to start right in it.
  useEffect(() => {
    if (kakaoKey && url) loadKakao(kakaoKey).catch((err: unknown) => console.warn(err));
  }, [kakaoKey, url]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (err) {
      console.error(err);
      setError(sharingErrorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Friends see the owner's companion by name, and it is the owner's. */
  async function makeLink(name?: string) {
    const ok = await run(async () => {
      if (me && name) await renameCompanion(me.id, name);
      if (me && me.accountId !== account.id) await claimCompanion(me.id, account.id);
      await createInvite(trip.id);
    });
    if (ok) setNaming(false);
  }

  function notify(message: string) {
    setNotice({ id: Date.now(), message });
  }

  function sendToKakao() {
    if (!url || !kakaoKey) return;
    setError(null);
    const card = {
      title: `‘${trip.title}’ 여행에 초대받았어요`,
      description: tripSummary({ ...trip, city: trip.city.name || null }),
      url,
      imageUrl: `${window.location.origin}/invite-card.jpg`,
      buttonTitle: '참여하기',
    };
    const failed = (err: unknown) => {
      console.error(err);
      setError('카카오톡을 열지 못했어요. 링크를 복사해서 보내 주세요.');
    };
    const sdk = loadedKakao();
    try {
      if (sdk) return sendKakaoCard(sdk, card);
    } catch (err) {
      return failed(err);
    }
    // Still loading (a slow connection): send once it's there.
    loadKakao(kakaoKey).then((loaded) => sendKakaoCard(loaded, card), failed);
  }

  async function shareLink() {
    if (!url) return;
    const message = inviteMessage(trip, url);
    if ((await shareText(message)) === 'failed') setManualCopy(message);
  }

  async function copyLink() {
    if (!url) return;
    if (await copyText(url)) notify('초대 링크를 복사했어요. 친구에게 보내 주세요.');
    else setManualCopy(url);
  }

  const loading = sharingTripId !== trip.id || (status === 'loading' && !invite);
  return (
    <PageSection
      title="초대 링크"
      description="링크를 받은 친구는 로그인한 뒤 이 여행의 일정과 가계부를 같이 보고 고칠 수 있어요."
      action={
        invite && (
          <button
            type="button"
            className={sectionActionClass}
            onClick={() => {
              setError(null);
              setCutting(true);
            }}
          >
            링크 끊기
          </button>
        )
      }
    >
      {invite ? (
        <div className="flex flex-col gap-2">
          <p className="truncate rounded-xl bg-gray-50 px-3 py-2.5 text-sm text-gray-600">{url}</p>
          <p className="text-sm text-gray-500">{inviteExpiry(invite.expiresAt)} 쓸 수 있어요.</p>
          {kakaoKey && (
            <button type="button" className={`${kakaoButtonClass} mt-1`} onClick={sendToKakao}>
              <KakaoSymbol />
              카카오톡으로 보내기
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            {canShare() && (
              <Button variant="secondary" onClick={() => void shareLink()}>
                공유
              </Button>
            )}
            <Button
              variant="secondary"
              className={canShare() ? '' : 'col-span-2'}
              onClick={() => void copyLink()}
            >
              링크 복사
            </Button>
          </div>
        </div>
      ) : (
        <Button
          block
          disabled={busy || !ready || (loading && status !== 'offline' && status !== 'error')}
          onClick={() => {
            setError(null);
            if (me && me.name === ME_NAME) setNaming(true);
            else void makeLink();
          }}
        >
          초대 링크 만들기
        </Button>
      )}
      {error && !naming && !cutting && (
        <p role="alert" className="mt-3 text-sm text-red-500">
          {error}
        </p>
      )}

      {naming && me && (
        <MyNameSheet
          me={me}
          companions={companions}
          suggested={ledgerAccount(account).name}
          busy={busy}
          error={error}
          onSave={(name) => void makeLink(name)}
          onClose={() => setNaming(false)}
        />
      )}
      <ConfirmSheet
        open={cutting}
        title="초대 링크를 끊을까요?"
        description="이 링크로는 더 참여할 수 없어요. 이미 함께하는 사람은 그대로예요. 새 링크는 언제든 만들 수 있어요."
        confirmLabel="끊기"
        tone="danger"
        busy={busy}
        error={error}
        onConfirm={() =>
          void run(async () => {
            await revokeInvite(trip.id);
            setCutting(false);
          })
        }
        onClose={() => setCutting(false)}
      />
      {manualCopy && (
        <CopyTextSheet title="초대 링크" text={manualCopy} onClose={() => setManualCopy(null)} />
      )}
      {notice && (
        <Snackbar key={notice.id} message={notice.message} onClose={() => setNotice(null)} />
      )}
    </PageSection>
  );
}
