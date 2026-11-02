import type { CurrencyCode, LocalDate } from '@/data/models';
import { currencyInfo, toDecimalString } from '@/data/rules/money';
import { diffDays } from '@/lib/dates';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function parts(date: LocalDate) {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

export function weekday(date: LocalDate): string {
  const { year, month, day } = parts(date);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]!;
}

/** `11.10 (화)`, or `2027.1.3 (일)` with the year. */
export function formatDate(date: LocalDate, withYear = false): string {
  const { year, month, day } = parts(date);
  return `${withYear ? `${year}.` : ''}${month}.${day} (${weekday(date)})`;
}

/** Shows a year only where it differs from the one before it (this year, then the start). */
export function formatDateRange(start: LocalDate, end: LocalDate, today: LocalDate): string {
  const startText = formatDate(start, start.slice(0, 4) !== today.slice(0, 4));
  if (start === end) return startText;
  return `${startText} – ${formatDate(end, end.slice(0, 4) !== start.slice(0, 4))}`;
}

type Josa = '을/를' | '이/가' | '은/는' | '과/와' | '으로/로';

// Korean readings of a final digit: 영 일 이 삼 사 오 육 칠 팔 구 (10, 100… end in 십/백 too).
const DIGIT_HAS_FINAL = [true, true, false, true, false, false, true, true, true, false];
const DIGIT_FINAL_IS_RIEUL = [false, true, false, false, false, false, false, true, true, false];

/**
 * `word` + the particle form that fits its last sound: `도톤보리를`, `보관함으로`, `Day 2로`.
 * Falls back to both forms (`USJ을(를)`) when the last character is not Hangul or a digit.
 */
export function josa(word: string, particle: Josa): string {
  const [withFinal, withoutFinal] = particle.split('/') as [string, string];
  const last = word.trim().at(-1) ?? '';
  const code = last.charCodeAt(0) - 0xac00;

  let hasFinal: boolean;
  let finalIsRieul: boolean;
  if (code >= 0 && code <= 11171) {
    hasFinal = code % 28 !== 0;
    finalIsRieul = code % 28 === 8;
  } else if (last >= '0' && last <= '9') {
    hasFinal = DIGIT_HAS_FINAL[Number(last)]!;
    finalIsRieul = DIGIT_FINAL_IS_RIEUL[Number(last)]!;
  } else {
    return `${word}${withFinal}(${withoutFinal})`;
  }

  // (으)로 takes 로 after ㄹ as well: 서울로, Day 1로.
  const useFinalForm = hasFinal && !(particle === '으로/로' && finalIsRieul);
  return word + (useFinalForm ? withFinal : withoutFinal);
}

/** `2박 3일`, or `당일치기` for a single day. */
export function formatTripLength(start: LocalDate, end: LocalDate): string {
  const nights = diffDays(start, end);
  return nights === 0 ? '당일치기' : `${nights}박 ${nights + 1}일`;
}

/** `12,000원` for won, `¥1,200` / `$12.34` for other currencies. `amount` is in minor units. */
export function formatMoney(amount: number, currency: CurrencyCode): string {
  const text = toDecimalString(Math.abs(amount), currency);
  const [whole, fraction] = text.split('.') as [string, string | undefined];
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction ? `.${fraction}` : '');
  const sign = amount < 0 ? '-' : '';
  return currency === 'KRW' ? `${sign}${grouped}원` : `${sign}${currencyInfo(currency).symbol}${grouped}`;
}
