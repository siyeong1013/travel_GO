import { describe, expect, it } from 'vitest';
import { ledgerCsv, ledgerFileName } from '@/features/expenses/ledgerCsv';
import { makeCompanion, makeExpense, makeTrip } from '@/test/fixtures';

const trip = makeTrip();
const me = makeCompanion({ tripId: trip.id, name: '나', isMe: true, order: 0 });
const chulsoo = makeCompanion({ tripId: trip.id, name: '철수', order: 1 });

/** The CSV's rows, split naively (the fixtures have no commas in quotes unless a test says so). */
const lines = (csv: string) => csv.split('\r\n').filter(Boolean);

describe('ledgerCsv', () => {
  it('starts with a byte order mark, so Excel reads Korean', () => {
    expect(ledgerCsv(trip, [me], []).startsWith('﻿날짜,')).toBe(true);
  });

  it('writes a row per expense in date order, each part, and a total row', () => {
    const csv = ledgerCsv(
      trip,
      [chulsoo, me],
      [
        makeExpense(
          {
            tripId: trip.id,
            date: '2026-11-11',
            amount: 1200,
            currency: 'JPY',
            exchangeRate: { rate: '9.04', quote: 'KRW', source: 'manual', fetchedAt: null },
            payerIds: [me.id],
            title: '타코야키',
            memo: '도톤보리',
          },
          [
            { companionId: me.id, weight: 1, amount: 600 },
            { companionId: chulsoo.id, weight: 1, amount: 600 },
          ],
        ),
        makeExpense(
          {
            tripId: trip.id,
            date: '2026-11-01',
            amount: 300_001,
            category: 'flight',
            paymentMethod: 'cash',
            payerIds: [chulsoo.id, me.id],
          },
          [
            { companionId: me.id, weight: 1, amount: 150_000 },
            { companionId: chulsoo.id, weight: 1, amount: 150_001 },
          ],
        ),
      ],
    );

    expect(lines(csv)).toEqual([
      '﻿날짜,일차,제목,카테고리,금액,통화,환율,정산 금액(KRW),결제 수단,결제한 사람,나 몫(KRW),철수 몫(KRW),메모',
      '2026-11-01,여행 전,항공,항공,300001,KRW,,300001,현금,"철수, 나",150000,150001,',
      '2026-11-11,Day 2,타코야키,식비,1200,JPY,9.04,10848,카드,나,5424,5424,도톤보리',
      '합계,,,,,,,310849,,,155424,155425,',
    ]);
  });

  it('writes decimals for currencies with cents', () => {
    const usd = makeTrip({ settlementCurrency: 'USD' });
    const csv = ledgerCsv(usd, [{ ...me, tripId: usd.id }], [
      makeExpense(
        {
          tripId: usd.id,
          amount: 1234,
          currency: 'USD',
          exchangeRate: { rate: '1', quote: 'USD', source: 'same', fetchedAt: null },
          payerIds: [me.id],
        },
        [{ companionId: me.id, weight: 1, amount: 1234 }],
      ),
    ]);
    expect(lines(csv)[1]).toBe('2026-11-10,Day 1,식비,식비,12.34,USD,,12.34,카드,나,12.34,');
  });

  it('leaves the settled amount empty when the rate is for another currency', () => {
    const csv = ledgerCsv(trip, [me], [
      makeExpense(
        {
          tripId: trip.id,
          amount: 1000,
          currency: 'JPY',
          exchangeRate: { rate: '0.0067', quote: 'USD', source: 'manual', fetchedAt: null },
          payerIds: [me.id],
        },
        [{ companionId: me.id, weight: 1, amount: 1000 }],
      ),
    ]);
    expect(lines(csv).slice(1)).toEqual([
      '2026-11-10,Day 1,식비,식비,1000,JPY,0.0067,,카드,나,,',
      '합계,,,,,,,0,,,0,',
    ]);
  });

  it('quotes commas, quotes and line breaks, and keeps formulas as text', () => {
    const csv = ledgerCsv(trip, [me], [
      makeExpense(
        {
          tripId: trip.id,
          amount: 1000,
          payerIds: [me.id],
          title: '=HYPERLINK("x")',
          memo: '라멘, 교자\n맛있음',
        },
        [{ companionId: me.id, weight: 1, amount: 1000 }],
      ),
    ]);
    expect(csv).toContain(
      '2026-11-10,Day 1,"\'=HYPERLINK(""x"")",식비,1000,KRW,,1000,카드,나,1000,"라멘, 교자\n맛있음"',
    );
  });
});

describe('ledgerFileName', () => {
  it('names the file after the trip, without characters files refuse', () => {
    expect(ledgerFileName({ title: '오사카 여행' })).toBe('오사카 여행 가계부.csv');
    expect(ledgerFileName({ title: '도쿄/요코하마: 2박' })).toBe('도쿄 요코하마 2박 가계부.csv');
  });
});
