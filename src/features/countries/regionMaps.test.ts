import { describe, expect, it } from 'vitest';
import { findRegions, type RegionRow, shownPlaces } from '@/features/countries/regionMaps';

describe('findRegions', () => {
  const regions: RegionRow[] = [
    ['VN-34', '카인호아성', 'M0 0Z'],
    ['VN-SG', '호찌민시', 'M1 1Z'],
    ['VN-27', '꽝남성', 'M2 2Z'],
  ];
  const places = { 'VN-34': ['나트랑', '냐짱'], 'VN-27': ['호이안'], 'VN-SG': ['호찌민'] };
  const codes = (query: string) => findRegions(regions, places, query).map(([code]) => code);

  it('finds regions by name or by a place in them', () => {
    expect(codes('')).toEqual(['VN-34', 'VN-SG', 'VN-27']);
    expect(codes('나트랑')).toEqual(['VN-34']);
    expect(codes('호치민')).toEqual(['VN-SG']);
    expect(codes('다낭')).toEqual([]);
  });

  it('puts the ones a name starts with first', () => {
    // 호찌민시 and 호이안 (in 꽝남성) start with it, 카인호아성 has it.
    expect(codes('호')).toEqual(['VN-SG', 'VN-27', 'VN-34']);
    expect(codes('짱')).toEqual(['VN-34']);
  });

  it('finds by a name typed with the word for a city after it', () => {
    expect(codes('나트랑시')).toEqual(['VN-34']);
  });
});

describe('shownPlaces', () => {
  const places = ['삿포로', '오타루', '하코다테', '후라노', '비에이', '아사히카와'];

  it("shows the best known, and the ones searched for first", () => {
    expect(shownPlaces(places, '홋카이도', '')).toEqual(['삿포로', '오타루', '하코다테', '후라노']);
    expect(shownPlaces(places, '홋카이도', '아사히카와')).toEqual(['아사히카와', '삿포로', '오타루', '하코다테']);
  });

  it("leaves out one the region's name says", () => {
    expect(shownPlaces(['교토', '우지'], '교토부', '')).toEqual(['우지']);
  });
});
