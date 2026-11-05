/**
 * iPhone, iPod or iPad, where web apps are installed by hand (Share → Add to Home Screen). An iPad
 * says it is a Mac, but a Mac has no touch screen.
 */
export function isIos(nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> = navigator): boolean {
  return (
    /iPhone|iPad|iPod/.test(nav.userAgent) ||
    (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1)
  );
}

/** KakaoTalk's in-app browser, where Google refuses to sign in (`disallowed_useragent`). */
export function isKakaoTalk(nav: Pick<Navigator, 'userAgent'> = navigator): boolean {
  return /KAKAOTALK/i.test(nav.userAgent);
}

/** The same page in the phone's own browser, opened from KakaoTalk's (`isKakaoTalk`). */
export function openInBrowserUrl(href: string): string {
  return `kakaotalk://web/openExternal?url=${encodeURIComponent(href)}`;
}

/** Opened from the home screen (an installed app), not in a browser tab. */
export function isStandalone(win: Window = window): boolean {
  return (
    win.matchMedia?.('(display-mode: standalone)').matches === true ||
    // iOS before display-mode support.
    (win.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
