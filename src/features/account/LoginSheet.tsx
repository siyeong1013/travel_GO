import { useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { LoginProvider } from '@/features/account/account';
import { useAccountStore } from '@/features/account/accountStore';
import { GoogleLoginButton, KakaoLoginButton } from '@/features/account/LoginButtons';
import { isKakaoTalk, openInBrowserUrl } from '@/lib/platform';

/** The Kakao / Google choice. Picking one leaves for that provider's login page. */
export function LoginSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="로그인">
      <div className="px-3 pb-4">
        <LoginChoices />
      </div>
    </BottomSheet>
  );
}

/**
 * Kakao, then Google (off inside KakaoTalk, which Google refuses: "다른 브라우저로 열기"). The login
 * comes back to `returnTo` (the account screen by default).
 */
export function LoginChoices({ returnTo }: { returnTo?: string }) {
  const signIn = useAccountStore((state) => state.signIn);
  const [inKakaoTalk] = useState(() => isKakaoTalk());
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(provider: LoginProvider) {
    setError(null);
    if (!navigator.onLine) {
      setError('인터넷에 연결되면 로그인할 수 있어요.');
      return;
    }
    setLeaving(true);
    try {
      await signIn(provider, returnTo); // the page then leaves for the provider
    } catch (err) {
      console.error(err);
      setError('로그인 화면을 열지 못했어요. 잠시 후 다시 시도해 주세요.');
      setLeaving(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-2">
        <KakaoLoginButton disabled={leaving} onClick={() => void start('kakao')} />
        <GoogleLoginButton disabled={leaving || inKakaoTalk} onClick={() => void start('google')} />
      </div>
      {inKakaoTalk && (
        <p className="mt-3 text-sm break-keep text-gray-500">
          카카오톡 안에서는 Google 로그인이 안 돼요.{' '}
          <a
            href={openInBrowserUrl(window.location.href)}
            className="font-semibold whitespace-nowrap text-brand-600 underline"
          >
            다른 브라우저로 열기
          </a>
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
