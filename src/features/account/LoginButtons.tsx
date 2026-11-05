import type { ButtonHTMLAttributes } from 'react';

type LoginButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'children'>;

const baseClass =
  'inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold transition-colors disabled:opacity-50';

/** Kakao's login button (its design guide): yellow, black speech bubble, label in 85% black. */
export function KakaoLoginButton({ className, ...props }: LoginButtonProps) {
  return (
    <button
      type="button"
      className={`${kakaoButtonClass} ${className ?? ''}`}
      {...props}
    >
      <KakaoSymbol />
      카카오 로그인
    </button>
  );
}

/** Kakao's speech bubble, as its login and share buttons carry it. */
export function KakaoSymbol() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true">
      <path
        fill="#000"
        d="M12 3.5c-5.25 0-9.5 3.36-9.5 7.5 0 2.62 1.7 4.92 4.28 6.26l-1.08 3.95c-.1.36.31.65.63.44l4.7-3.11c.32.03.64.05.97.05 5.25 0 9.5-3.36 9.5-7.5S17.25 3.5 12 3.5Z"
      />
    </svg>
  );
}

/** Kakao's yellow, for a button of its service (login, KakaoTalk share). */
export const kakaoButtonClass = `${baseClass} bg-[#fee500] text-black/85 active:bg-[#f2d900]`;

/** Google's sign-in button, light theme (its branding guide): white, gray outline, the four-color G. */
export function GoogleLoginButton({ className, ...props }: LoginButtonProps) {
  return (
    <button
      type="button"
      className={`${baseClass} border border-[#747775] bg-white text-[#1f1f1f] active:bg-gray-50 ${className ?? ''}`}
      {...props}
    >
      <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true">
        <path
          fill="#4285f4"
          d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
        />
        <path
          fill="#34a853"
          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z"
        />
        <path
          fill="#fbbc05"
          d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29a11.99 11.99 0 0 0 0 10.76l3.98-3.09Z"
        />
        <path
          fill="#ea4335"
          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42A11.5 11.5 0 0 0 12 0 11.99 11.99 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
        />
      </svg>
      Google 계정으로 로그인
    </button>
  );
}
