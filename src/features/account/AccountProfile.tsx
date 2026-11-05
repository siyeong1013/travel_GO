import { type ReactNode, useEffect, useState } from 'react';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { UserIcon } from '@/components/ui/icons';
import type { Account, LoginError, LoginProvider } from '@/features/account/account';
import { useAccountStore } from '@/features/account/accountStore';
import { LoginSheet } from '@/features/account/LoginSheet';
import { SyncNote } from '@/features/sync/SyncNote';
import { useSyncStore } from '@/features/sync/syncStore';
import { supabaseConfig } from '@/lib/supabase';

const SIGNED_IN_WITH: Record<LoginProvider, string> = {
  kakao: '카카오로 로그인했어요',
  google: 'Google로 로그인했어요',
};

const LOGIN_ERRORS: Record<LoginError, string> = {
  cancelled: '로그인을 취소했어요.',
  failed: '로그인하지 못했어요. 잠시 후 다시 시도해 주세요.',
};

/**
 * The account screen: who is signed in (photo, name, how), how syncing goes, and a sign-out that
 * says what it takes off the device; or a blank profile asking to sign in, whose "로그인" opens
 * the Kakao / Google choice. Says so when the build has no login (no Supabase project).
 */
export function AccountProfile() {
  const [configured] = useState(() => supabaseConfig() !== null);
  const status = useAccountStore((state) => state.status);
  const account = useAccountStore((state) => state.account);
  const loginError = useAccountStore((state) => state.loginError);
  const load = useAccountStore((state) => state.load);
  const signOut = useAccountStore((state) => state.signOut);
  const checkSignOut = useSyncStore((state) => state.checkSignOut);
  const [choosing, setChoosing] = useState(false);
  /** The sign-out question: open while it is a number (changes that would be lost) or 'checking'. */
  const [leaving, setLeaving] = useState<number | 'checking' | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (configured) void load();
  }, [configured, load]);

  if (!configured || status === 'unavailable') {
    return <EmptyState title="로그인을 쓸 수 없어요" description="이 버전에는 로그인이 없어요." />;
  }

  const checking = status === 'idle' || status === 'loading';
  return (
    <div className="px-4 pt-6 pb-8">
      <div className="flex items-center gap-4">
        <Avatar account={account} />
        <div className="min-w-0 flex-1">
          {checking ? (
            <p className="text-gray-500">로그인 상태를 확인하고 있어요.</p>
          ) : account ? (
            <>
              <p className="truncate text-lg font-bold">{account.name}</p>
              <p className="text-sm text-gray-500">
                {account.provider ? SIGNED_IN_WITH[account.provider] : '로그인했어요'}
              </p>
            </>
          ) : (
            <p className="text-lg font-bold">로그인해 주세요</p>
          )}
        </div>
        {!checking &&
          (account ? (
            <PillButton
              onClick={() => {
                setLeaving('checking');
                void checkSignOut().then(setLeaving);
              }}
            >
              로그아웃
            </PillButton>
          ) : (
            <PillButton onClick={() => setChoosing(true)}>로그인</PillButton>
          ))}
      </div>
      {loginError && !account && (
        <p role="alert" className="mt-4 text-sm text-red-500">
          {LOGIN_ERRORS[loginError]}
        </p>
      )}
      {account && <SyncNote />}
      {!checking && (
        <p className="mt-6 rounded-2xl bg-gray-50 px-4 py-3 text-sm leading-relaxed break-keep text-gray-600">
          {account
            ? '여행은 이 계정에 저장돼요. 다른 기기에서 같은 계정으로 로그인하면 같은 여행이 보여요. 친구는 여행의 ⋯ 메뉴에서 ‘친구 초대’로 초대해요.'
            : '로그인하면 여행이 계정에 저장돼서 다른 기기에서도 같은 여행을 볼 수 있어요. 로그인하지 않아도 지금처럼 이 기기에 저장돼요.'}
        </p>
      )}
      <LoginSheet open={choosing && !account} onClose={() => setChoosing(false)} />
      <ConfirmSheet
        open={leaving !== null && account !== null}
        title="로그아웃할까요?"
        description={
          leaving === 'checking'
            ? '서버에 아직 올리지 못한 변경이 있는지 보고 있어요.'
            : leaving
              ? `서버에 아직 올리지 못한 변경이 ${leaving}개 있어요. 지금 로그아웃하면 이 변경은 사라져요.`
              : '이 기기에서 여행이 지워져요. 같은 계정으로 다시 로그인하면 그대로 돌아와요.'
        }
        confirmLabel="로그아웃"
        tone={typeof leaving === 'number' && leaving > 0 ? 'danger' : 'primary'}
        busy={leaving === 'checking' || signingOut}
        onConfirm={() => {
          setSigningOut(true);
          void signOut().finally(() => {
            setSigningOut(false);
            setLeaving(null);
          });
        }}
        onClose={() => setLeaving(null)}
      />
    </div>
  );
}

/** An outlined pill beside the profile, on a 44px touch target. */
function PillButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex h-11 shrink-0 items-center">
      <span className="rounded-full border border-gray-300 px-3.5 py-1.5 text-sm font-semibold text-gray-800 transition-colors group-active:bg-gray-100">
        {children}
      </span>
    </button>
  );
}

/** The provider's profile photo, the name's first letter, or a blank person when signed out. */
function Avatar({ account }: { account: Account | null }) {
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const size = 'size-16 shrink-0 rounded-full';
  if (account?.avatarUrl && account.avatarUrl !== brokenUrl) {
    const url = account.avatarUrl;
    return (
      <img
        src={url}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBrokenUrl(url)}
        className={`${size} bg-gray-100 object-cover ring-1 ring-black/5`}
      />
    );
  }
  if (account) {
    return (
      <div
        aria-hidden="true"
        className={`${size} flex items-center justify-center bg-brand-50 text-2xl font-bold text-brand-600`}
      >
        {Array.from(account.name)[0]}
      </div>
    );
  }
  return (
    <div
      aria-hidden="true"
      className={`${size} flex items-center justify-center bg-gray-100 text-gray-400`}
    >
      <UserIcon width={32} height={32} />
    </div>
  );
}
