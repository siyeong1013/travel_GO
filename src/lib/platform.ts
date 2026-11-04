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

/** Opened from the home screen (an installed app), not in a browser tab. */
export function isStandalone(win: Window = window): boolean {
  return (
    win.matchMedia?.('(display-mode: standalone)').matches === true ||
    // iOS before display-mode support.
    (win.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
