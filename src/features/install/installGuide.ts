import { deviceStorage } from '@/lib/deviceStorage';
import { isIos, isStandalone } from '@/lib/platform';

/** Set when the suggestion on the trip list is closed: it doesn't come back (settings has the guide). */
const BANNER_CLOSED_KEY = 'travel-go:install-banner-closed';

/** In a browser on iOS the app is added to the home screen by hand, so it is worth showing how. */
export function needsInstallGuide(): boolean {
  return isIos() && !isStandalone();
}

/** The suggestion on the trip list shows until it is closed once. */
export function showsInstallBanner(): boolean {
  return needsInstallGuide() && !deviceStorage()?.getItem(BANNER_CLOSED_KEY);
}

export function closeInstallBanner() {
  try {
    deviceStorage()?.setItem(BANNER_CLOSED_KEY, new Date().toISOString());
  } catch {
    // Storage full or blocked: the suggestion just comes back next time.
  }
}
