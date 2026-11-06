import { describe, expect, it } from 'vitest';
import { searchCountries } from '@/features/countries/countryNames';

describe('searchCountries', () => {
  const places = {
    'FR-IDF': ['파리', '베르사유'],
    'FR-PAC': ['니스', '칸'],
    'AU-NSW': ['시드니', '뉴캐슬'],
    'CA-NS': ['핼리팩스', '시드니'],
    'KR-49': ['서귀포', '제주'],
    'IT-75': ['바리'],
    'TH-83': ['푸껫'],
    SG: ['싱가포르'],
  };
  const search = (query: string) => searchCountries(query, places);

  it('finds countries by their names, those starting with it first', () => {
    // 인도, 인도네시아, 영국령 인도양 지역.
    expect(search('인도').map(({ code }) => code)).toEqual(['IN', 'ID', 'IO']);
    expect(search('사이판')).toEqual([{ code: 'MP', places: [] }]);
    expect(search('japan')).toEqual([{ code: 'JP', places: [] }]);
  });

  it('finds countries by a city in them, with the city', () => {
    // Not 바리 too: as it sounds only when nothing is written so.
    expect(search('파리')).toEqual([{ code: 'FR', places: ['파리'] }]);
    expect(search('푸켓')).toEqual([{ code: 'TH', places: ['푸껫'] }]);
    expect(search('제주도')).toEqual([{ code: 'KR', places: ['제주'] }]);
    // Its own name: no city to show.
    expect(search('싱가포르')).toEqual([{ code: 'SG', places: [] }]);
  });

  it('puts a city that is the query before a name that has it, and the better known city first', () => {
    // 아프가니스탄 and 투르크메니스탄 have 니스.
    expect(search('니스').map(({ code }) => code)).toEqual(['FR', 'AF', 'TM']);
    // First in Australia's list, later in Canada's.
    expect(search('시드니').map(({ code }) => code)).toEqual(['AU', 'CA']);
  });

  it('finds nothing for nothing', () => {
    expect(search('')).toEqual([]);
    expect(search('아틀란티스')).toEqual([]);
  });
});
