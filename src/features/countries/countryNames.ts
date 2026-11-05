import { COUNTRY_CODES } from '@/features/countries/countryCodes';

// Shorter than the locale data's, or how people say them.
const NAMES: Record<string, string> = {
  HK: '홍콩',
  MO: '마카오',
  PS: '팔레스타인',
  MP: '북마리아나 제도',
  VA: '바티칸',
};

// Places people look for that are part of a country on the map.
const ALSO_CALLED: Record<string, string[]> = {
  MP: ['사이판'],
  US: ['하와이', '알래스카'],
  AE: ['두바이'],
  ID: ['발리'],
  GB: ['잉글랜드', '스코틀랜드', '런던'],
};

let korean: Intl.DisplayNames | null | undefined;
let english: Intl.DisplayNames | null | undefined;

function displayNames(locale: string): Intl.DisplayNames | null {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' });
  } catch {
    return null;
  }
}

/** `일본`, from the device's locale data (`JP` when it has none). */
export function countryName(code: string): string {
  korean ??= displayNames('ko');
  return NAMES[code] ?? korean?.of(code) ?? code;
}

function englishName(code: string): string {
  english ??= displayNames('en');
  return english?.of(code) ?? code;
}

/** The flag emoji of a country code (`🇯🇵`). */
export function flagOf(code: string): string {
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

const key = (text: string) => text.replace(/\s+/g, '').toLocaleLowerCase('ko-KR');

/**
 * Countries whose name (Korean or English), another name people use (사이판) or code has
 * `query` in it: names starting with it first, then by name.
 */
export function searchCountries(query: string): string[] {
  const wanted = key(query);
  if (!wanted) return [];
  const scored: { code: string; starts: boolean; name: string }[] = [];
  for (const code of COUNTRY_CODES) {
    const name = countryName(code);
    const names = [name, englishName(code), code, ...(ALSO_CALLED[code] ?? [])].map(key);
    if (!names.some((n) => n.includes(wanted))) continue;
    scored.push({ code, starts: names.some((n) => n.startsWith(wanted)), name });
  }
  return scored
    .sort((a, b) => Number(b.starts) - Number(a.starts) || a.name.localeCompare(b.name, 'ko'))
    .map((entry) => entry.code);
}

/** `codes` by their Korean names. */
export function byName(codes: string[]): string[] {
  return [...codes].sort((a, b) => countryName(a).localeCompare(countryName(b), 'ko'));
}
