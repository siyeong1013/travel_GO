import { describe, expect, it } from 'vitest';
import { isIos, isStandalone } from '@/lib/platform';

const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1',
  // iPadOS Safari asks for desktop sites, so it reads like a Mac.
  ipadOrMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
  android:
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
};

describe('isIos', () => {
  it('knows iPhones, whatever the browser, and iPads that read like a Mac', () => {
    expect(isIos({ userAgent: UA.iphone, maxTouchPoints: 5 })).toBe(true);
    expect(isIos({ userAgent: UA.iphoneChrome, maxTouchPoints: 5 })).toBe(true);
    expect(isIos({ userAgent: UA.ipadOrMac, maxTouchPoints: 5 })).toBe(true);
  });

  it('is false for a Mac and for Android', () => {
    expect(isIos({ userAgent: UA.ipadOrMac, maxTouchPoints: 0 })).toBe(false);
    expect(isIos({ userAgent: UA.android, maxTouchPoints: 5 })).toBe(false);
  });
});

describe('isStandalone', () => {
  const win = (displayMode: boolean, standalone?: boolean) =>
    ({
      matchMedia: (query: string) => ({ matches: displayMode && query === '(display-mode: standalone)' }),
      navigator: { standalone },
    }) as unknown as Window;

  it('is true when opened from the home screen', () => {
    expect(isStandalone(win(true))).toBe(true);
    expect(isStandalone(win(false, true))).toBe(true);
  });

  it('is false in a browser tab', () => {
    expect(isStandalone(win(false, false))).toBe(false);
    expect(isStandalone(win(false))).toBe(false);
  });
});
