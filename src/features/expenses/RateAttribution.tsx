import { RATE_ATTRIBUTION } from '@/lib/exchangeRateApi';

/** The link the exchange-rate API's terms ask for wherever its rates are used. */
export function RateSourceLink() {
  return (
    <a
      href={RATE_ATTRIBUTION.url}
      target="_blank"
      rel="noreferrer"
      className="underline underline-offset-2"
    >
      {RATE_ATTRIBUTION.text}
    </a>
  );
}

/** Footnote for screens with amounts converted at API rates. */
export function RateAttribution() {
  return (
    <p className="px-4 pt-2 pb-4 text-xs text-gray-400">
      환율 출처: <RateSourceLink />
    </p>
  );
}
