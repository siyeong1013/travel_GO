/** Text to search by as written: letters and digits only, lowercase. */
export function writtenKey(text: string): string {
  return text.toLocaleLowerCase('ko-KR').replace(/[^\p{L}\p{N}]/gu, '');
}

// Hangul syllables from 가 (U+AC00): 19 initial consonants × 21 vowels × 28 endings. Ones that
// sound alike share an index: ㄱㄲㅋ ㄷㄸㅌ ㅂㅃㅍ ㅅㅆ ㅈㅉㅊ, and the vowels ㅐㅒㅔㅖ, ㅙㅚㅞ.
const INITIALS = [0, 0, 2, 3, 3, 5, 6, 7, 7, 9, 9, 11, 12, 12, 12, 0, 3, 7, 18];
const VOWELS = [0, 5, 2, 5, 4, 5, 6, 5, 8, 9, 11, 11, 12, 13, 14, 11, 16, 17, 18, 19, 20];

/**
 * Text as it roughly sounds, to search by: names as the data writes them (호찌민, 끄라비, 구마모토)
 * and as people type them (호치민, 크라비, 쿠마모토) come out the same. Letters and digits only.
 */
export function soundKey(text: string): string {
  let key = '';
  for (const char of writtenKey(text)) {
    const syllable = char.charCodeAt(0) - 0xac00;
    if (syllable >= 0 && syllable < 19 * 21 * 28) {
      const initial = INITIALS[Math.floor(syllable / (21 * 28))]!;
      const vowel = VOWELS[Math.floor(syllable / 28) % 21]!;
      key += String.fromCharCode(0xac00 + (initial * 21 + vowel) * 28 + (syllable % 28));
    } else {
      key += char;
    }
  }
  return key;
}

export type KeyKind = 'written' | 'sound';
export const keyOf: Readonly<Record<KeyKind, (text: string) => string>> = { written: writtenKey, sound: soundKey };

/** One way to look for a query: its key, to find in names' keys of that kind. */
export interface SearchTry {
  key: string;
  kind: KeyKind;
}

// The word for a city or province people may type after a name (제주도, 삿포로시), which the name
// as written may not have (제주특별자치도, 삿포로).
const PLACE_WORD = /(특별자치시|특별자치도|특별시|광역시|시|도|군|현|성|주|부|구)$/;

/** `name` without such a word at its end if two letters are left (제주도 → 제주, not 광주 → 광). */
export function shortName(name: string): string {
  const short = name.trim().replace(PLACE_WORD, '');
  return [...writtenKey(short)].length >= 2 ? short : name;
}

/**
 * The ways to look for `query`, in turn, for when one finds nothing: as written; then without such
 * a word at its end (`shortName`); then both as they sound (푸켓 finds 푸껫, but 파리 doesn't find
 * 바리 as long as it finds 파리). None for an empty query.
 */
export function searchTries(query: string): SearchTry[] {
  const texts = [query, shortName(query)];
  const tries = (['written', 'sound'] as const).flatMap((kind) =>
    texts.map((text) => ({ key: keyOf[kind](text), kind })),
  );
  return tries.filter(
    (one, i) => one.key && !tries.slice(0, i).some((other) => other.kind === one.kind && other.key === one.key),
  );
}

/** How well `text` matches `wanted` (both keys): 0 it is that, 1 starts with it, 2 has it, 3 not. */
export function matchRank(text: string, wanted: string): number {
  if (text === wanted) return 0;
  if (text.startsWith(wanted)) return 1;
  return text.includes(wanted) ? 2 : 3;
}

/** What `find` finds with the first of `tries` that finds anything. */
export function firstFound<T>(tries: SearchTry[], find: (one: SearchTry) => T[]): T[] {
  for (const one of tries) {
    const found = find(one);
    if (found.length > 0) return found;
  }
  return [];
}
