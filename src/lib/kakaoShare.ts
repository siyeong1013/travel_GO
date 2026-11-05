// KakaoTalk share (Kakao's JavaScript SDK): an invite card with a "참여하기" button.
// The key and the site go in the Kakao app's settings: [앱] > [플랫폼 키] > [JavaScript 키] >
// [JavaScript SDK 도메인], and the links' domain in [앱] > [제품 링크 관리] > [웹 도메인].

/** The SDK as Kakao's download page gives it (version, and the hash the browser checks). */
const SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.4/kakao.min.js';
const SDK_INTEGRITY = 'sha384-BGX7Wb16GmRFagri4bLJV2DgipVZaU2AI812GZtHtHzzDQJnfHasDXN5houxv45w';

export interface KakaoSdk {
  init: (key: string) => void;
  isInitialized: () => boolean;
  Share: { sendDefault: (settings: Record<string, unknown>) => void };
}

declare global {
  interface Window {
    Kakao?: KakaoSdk;
  }
}

/** The Kakao app's JavaScript key (`VITE_KAKAO_JAVASCRIPT_KEY`, public); null: no KakaoTalk share. */
export function kakaoJavaScriptKey(): string | null {
  return import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY?.trim() || null;
}

let loading: Promise<KakaoSdk> | null = null;
let loaded: KakaoSdk | null = null;

/** Loads the SDK once and starts it with `key`; after a failure (offline), the next call tries again. */
export function loadKakao(key: string): Promise<KakaoSdk> {
  loading ??= new Promise<KakaoSdk>((resolve, reject) => {
    const start = () => {
      const sdk = window.Kakao;
      if (!sdk) return reject(new Error('the Kakao SDK did not start'));
      if (!sdk.isInitialized()) sdk.init(key);
      loaded = sdk;
      resolve(sdk);
    };
    if (window.Kakao) return start();
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.integrity = SDK_INTEGRITY;
    script.crossOrigin = 'anonymous';
    script.async = true;
    script.onload = start;
    script.onerror = () => {
      script.remove();
      reject(new Error('the Kakao SDK did not load'));
    };
    document.head.append(script);
  }).catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

/**
 * The started SDK, if it has loaded. Sharing must start right in the click: on a computer it opens
 * Kakao's page in a popup, which browsers block after an `await`.
 */
export function loadedKakao(): KakaoSdk | null {
  return loaded;
}

export interface KakaoCard {
  title: string;
  description: string;
  /** Opened by the card and its button. Its domain must be one of the Kakao app's web domains. */
  url: string;
  /** An image on the web (Kakao's server fetches it), 2:1. */
  imageUrl: string;
  buttonTitle: string;
}

/** Opens KakaoTalk (or Kakao's page) to send `card` to a chat. */
export function sendKakaoCard(sdk: KakaoSdk, card: KakaoCard) {
  const link = { mobileWebUrl: card.url, webUrl: card.url };
  sdk.Share.sendDefault({
    objectType: 'feed',
    content: {
      title: card.title,
      description: card.description,
      imageUrl: card.imageUrl,
      imageWidth: 800,
      imageHeight: 400,
      link,
    },
    buttons: [{ title: card.buttonTitle, link }],
  });
}
