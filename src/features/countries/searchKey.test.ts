import { describe, expect, it } from 'vitest';
import { firstFound, matchRank, searchTries, soundKey, writtenKey } from '@/features/countries/searchKey';

describe('soundKey', () => {
  it('makes names as written and as people type them the same', () => {
    expect(soundKey('푸켓')).toBe(soundKey('푸껫'));
    expect(soundKey('크라비')).toBe(soundKey('끄라비'));
    expect(soundKey('칸차나부리')).toBe(soundKey('깐짜나부리'));
    expect(soundKey('쿠마모토')).toBe(soundKey('구마모토'));
    expect(soundKey('호찌민시')).toContain(soundKey('호치민'));
    expect(soundKey('Ho Chi Minh')).toBe('hochiminh');
  });

  it('keeps names that only look alike apart', () => {
    expect(soundKey('나트랑')).not.toBe(soundKey('냐짱'));
    expect(soundKey('부산')).not.toBe(soundKey('부천'));
  });
});

describe('searchTries', () => {
  it('tries as written, then without the word for a city or province, then as they sound', () => {
    expect(searchTries(' 제주도 ')).toEqual([
      { key: '제주도', kind: 'written' },
      { key: '제주', kind: 'written' },
      { key: soundKey('제주도'), kind: 'sound' },
      { key: soundKey('제주'), kind: 'sound' },
    ]);
    expect(searchTries('Ho Chi Minh')).toEqual([
      { key: 'hochiminh', kind: 'written' },
      { key: 'hochiminh', kind: 'sound' },
    ]);
  });

  it('keeps the word when a name would be one letter', () => {
    expect(searchTries('광주').map(({ key }) => key)).toEqual([writtenKey('광주'), soundKey('광주')]);
    expect(searchTries(' ')).toEqual([]);
  });
});

describe('matchRank', () => {
  it('puts a name that is the query before one starting with it, then one having it', () => {
    expect([matchRank('로마', '로마'), matchRank('로마냐', '로마'), matchRank('에밀리아로마냐', '로마')]).toEqual([
      0, 1, 2,
    ]);
    expect(matchRank('밀라노', '로마')).toBe(3);
  });
});

describe('firstFound', () => {
  it('finds with the next try only when one finds nothing', () => {
    const names = ['제주', '제주도청'];
    const find = ({ key }: { key: string }) => names.filter((name) => name.includes(key));
    expect(firstFound(searchTries('제주도'), find)).toEqual(['제주도청']);
    expect(firstFound(searchTries('제주시'), find)).toEqual(['제주', '제주도청']);
    expect(firstFound(searchTries('한라산'), find)).toEqual([]);
  });
});
