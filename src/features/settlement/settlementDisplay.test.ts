import { describe, expect, it } from 'vitest';
import type { Settlement } from '@/data/models';
import { buildLedger } from '@/data/rules/ledger';
import { planTransfers } from '@/data/rules/settlementPlan';
import { splitExpense } from '@/data/rules/split';
import {
  balanceText,
  orderTransfers,
  settlementText,
  transferLabel,
} from '@/features/settlement/settlementDisplay';
import { makeCompanion, makeExpense, makeTrip, T0 } from '@/test/fixtures';

const trip = makeTrip({ title: '오사카 여행' });
const me = makeCompanion({ tripId: trip.id, name: '나', isMe: true, order: 0 });
const chulsoo = makeCompanion({ tripId: trip.id, name: '철수', order: 1 });
const younghee = makeCompanion({ tripId: trip.id, name: '영희', order: 2 });
const companions = [me, chulsoo, younghee];

/** Paid by `payer`, split equally among everyone. */
function shared(payer: typeof me, amount: number) {
  const split = splitExpense(
    amount,
    payer.id,
    'equal',
    companions.map((c) => ({ companionId: c.id, value: null })),
  );
  if (!split.ok) throw new Error('bad split');
  return makeExpense({ tripId: trip.id, payerId: payer.id, amount }, split.shares);
}

const sent = (from: typeof me, to: typeof me, amount: number): Settlement => ({
  id: `${from.id}-${to.id}`,
  tripId: trip.id,
  fromId: from.id,
  toId: to.id,
  amount,
  currency: 'KRW',
  createdAt: T0,
  updatedAt: T0,
});

describe('orderTransfers', () => {
  it('lists transfers by sender, then receiver, in companion order', () => {
    const transfers = [
      { fromId: younghee.id, toId: me.id, amount: 1 },
      { fromId: chulsoo.id, toId: younghee.id, amount: 2 },
      { fromId: chulsoo.id, toId: me.id, amount: 3 },
    ];
    expect(orderTransfers(transfers, companions).map((t) => t.amount)).toEqual([3, 2, 1]);
  });
});

describe('labels', () => {
  it('says who gets or sends money', () => {
    expect(balanceText(12_000, 'KRW')).toBe('받을 돈 12,000원');
    expect(balanceText(-1_250, 'USD')).toBe('보낼 돈 $12.50');
    expect(balanceText(0, 'KRW')).toBe('없음');
  });

  it('names a transfer for its checkbox', () => {
    expect(transferLabel({ fromId: chulsoo.id, toId: me.id, amount: 30_000 }, companions, 'KRW')).toBe(
      '철수가 나에게 30,000원 보냄',
    );
    expect(transferLabel({ fromId: me.id, toId: younghee.id, amount: 500 }, companions, 'JPY')).toBe(
      '내가 영희에게 ¥500 보냄',
    );
  });
});

describe('settlementText', () => {
  it('lists what everyone spent, the transfers left and those done', () => {
    // 나 paid 90,000, 철수 30,000; everyone owes 40,000. 영희 already sent 10,000 to 나.
    const expenses = [shared(me, 90_000), shared(chulsoo, 30_000)];
    const settlements = [sent(younghee, me, 10_000)];
    const ledger = buildLedger(trip, companions, expenses, settlements);
    const transfers = orderTransfers(planTransfers(ledger.balances), companions);

    expect(settlementText({ trip, companions, ledger, transfers, settlements })).toBe(
      [
        '[오사카 여행 정산]',
        '총 지출 120,000원 · 3명',
        '',
        '각자 쓴 돈',
        '- 나 40,000원',
        '- 철수 40,000원',
        '- 영희 40,000원',
        '',
        '송금할 돈',
        '- 철수 → 나 10,000원',
        '- 영희 → 나 30,000원',
        '',
        '송금 완료',
        '- 영희 → 나 10,000원',
      ].join('\n'),
    );
  });

  it('says when everyone is even, and when expenses were left out', () => {
    const ledger = buildLedger(trip, companions, [shared(me, 30_000)], []);
    const settled = { ...ledger, balances: ledger.balances.map((b) => ({ ...b, balance: 0 })) };
    const text = settlementText({
      trip,
      companions,
      ledger: { ...settled, unconvertible: ['stray'] },
      transfers: [],
      settlements: [],
    });
    expect(text).toContain('\n모두 정산했어요.');
    expect(text).not.toContain('송금할 돈');
    expect(text.endsWith('※ 환율을 다시 입력해야 하는 지출 1건은 빠져 있어요.')).toBe(true);
  });
});
