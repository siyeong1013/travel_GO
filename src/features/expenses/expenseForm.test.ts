import { describe, expect, it } from 'vitest';
import type { ExpenseWithShares } from '@/data/models';
import {
  cleanRateText,
  type ExpenseFormValues,
  groupedAmount,
  lastRates,
  newExpenseValues,
  newPlaceDate,
  previewConverted,
  previewSplit,
  toExpenseInput,
  toFormValues,
  validateExpenseForm,
  withCurrency,
  withSplit,
} from '@/features/expenses/expenseForm';
import { makeCompanion, makeExpense, makeItem, makeTrip } from '@/test/fixtures';

const trip = makeTrip({ startDate: '2026-11-10', endDate: '2026-11-12' });
const me = makeCompanion({ tripId: trip.id, name: '나', isMe: true, order: 0 });
const chulsoo = makeCompanion({ tripId: trip.id, name: '철수', order: 1 });
const younghee = makeCompanion({ tripId: trip.id, name: '영희', order: 2 });
const companions = [me, chulsoo, younghee];

const blank = () => newExpenseValues({ trip, expenses: [], today: '2026-11-11' });
const filled = (overrides: Partial<ExpenseFormValues> = {}): ExpenseFormValues => ({
  ...blank(),
  amount: '10,000',
  category: 'food',
  payerIds: [me.id],
  participantIds: companions.map((c) => c.id),
  ...overrides,
});

const jpy = (createdAt: string, rate: string, quote = 'KRW'): ExpenseWithShares =>
  makeExpense(
    {
      tripId: trip.id,
      payerIds: [me.id],
      amount: 1_000,
      currency: 'JPY',
      paymentMethod: 'cash',
      exchangeRate: { rate, quote, source: 'api', fetchedAt: '2026-11-10T00:00:00.000Z' },
      createdAt,
    },
    [{ companionId: me.id, weight: 1, amount: 1_000 }],
  );

describe('newExpenseValues', () => {
  it('starts with nobody paying or sharing yet, today during the trip', () => {
    expect(blank()).toMatchObject({
      amount: '',
      currency: 'KRW',
      category: null,
      date: '2026-11-11',
      paymentMethod: 'card',
      payerIds: [],
      splitMethod: 'equal',
      participantIds: [],
      scheduleItemId: null,
    });
    const before = newExpenseValues({ trip, expenses: [], today: '2026-11-02' });
    expect(before.date).toBe('2026-11-10');
  });

  it('follows the latest expense for currency, rate and payment method', () => {
    const expenses = [jpy('2026-11-10T02:00:00.000Z', '9.1'), jpy('2026-11-10T01:00:00.000Z', '9')];
    const values = newExpenseValues({ trip, expenses, today: '2026-11-11' });
    expect(values).toMatchObject({
      currency: 'JPY',
      paymentMethod: 'cash',
      rate: { rate: '9.10', source: 'last', fetchedAt: '2026-11-10T00:00:00.000Z' },
    });
  });

  it('links a schedule item and takes its day', () => {
    const item = makeItem({ tripId: trip.id, date: '2026-11-12' });
    const values = newExpenseValues({
      trip,
      expenses: [],
      today: '2026-11-11',
      scheduleItem: item,
    });
    expect(values).toMatchObject({ scheduleItemId: item.id, date: '2026-11-12' });
  });

  it("puts a place found for it on the expense's day, or in the inbox outside the trip", () => {
    expect(newPlaceDate('2026-11-12', trip)).toBe('2026-11-12');
    expect(newPlaceDate('2026-11-01', trip)).toBeNull();
    expect(newPlaceDate('', trip)).toBeNull();
  });
});

describe('rates', () => {
  it('remembers the latest rate per currency quoted in the settlement currency', () => {
    const rates = lastRates(
      [jpy('2026-11-10T03:00:00.000Z', '0.0067', 'USD'), jpy('2026-11-10T01:00:00.000Z', '9')],
      'KRW',
    );
    expect([...rates]).toEqual([
      ['JPY', { rate: '9.00', source: 'last', fetchedAt: '2026-11-10T00:00:00.000Z' }],
    ]);
    expect(withCurrency(blank(), 'JPY', rates).rate.rate).toBe('9.00');
    expect(withCurrency(blank(), 'USD', rates).rate).toEqual({
      rate: '',
      source: 'manual',
      fetchedAt: null,
    });
  });

  it("falls back to rates used on other trips, this trip's own first", () => {
    const used = (currency: string, rate: string, quote: string, createdAt: string) => ({
      currency,
      exchangeRate: { rate, quote, source: 'manual' as const, fetchedAt: null },
      createdAt,
    });
    const rates = lastRates([jpy('2026-11-10T01:00:00.000Z', '9')], 'KRW', [
      used('JPY', '9.5', 'KRW', '2026-11-11T00:00:00.000Z'), // later, but on another trip
      used('USD', '1380', 'KRW', '2026-03-01T00:00:00.000Z'),
      used('EUR', '0.006', 'JPY', '2026-03-01T00:00:00.000Z'), // quoted in yen: no use here
    ]);
    expect(Object.fromEntries(rates)).toEqual({
      JPY: { rate: '9.00', source: 'last', fetchedAt: '2026-11-10T00:00:00.000Z' },
      USD: { rate: '1380', source: 'last', fetchedAt: null }, // typed: as typed
    });
  });

  it('cleans typed rates', () => {
    expect(cleanRateText(' 1,380.50 ')).toBe('1380.50');
    expect(cleanRateText('09.04')).toBe('9.04');
    expect(cleanRateText('0')).toBeNull();
    expect(cleanRateText('9,04.1.2')).toBeNull();
  });

  it('previews the amount in the settlement currency', () => {
    const values = filled({ amount: '1200', currency: 'JPY' });
    expect(previewConverted(values, 'KRW')).toBeNull();
    const withRate = { ...values, rate: { rate: '9.0412', source: 'manual' as const, fetchedAt: null } };
    expect(previewConverted(withRate, 'KRW')).toBe(10_849); // 10,849.44
    expect(previewConverted(filled(), 'KRW')).toBe(10_000);
  });
});

describe('groupedAmount', () => {
  /** `text` with `|` for the caret, as typed → as drawn. */
  const typing = (text: string) => {
    const typed = groupedAmount(text.replace('|', ''), text.indexOf('|'));
    return `${typed.text.slice(0, typed.caret)}|${typed.text.slice(typed.caret)}`;
  };

  it('groups the whole part by thousands as it is typed, keeping the caret among the digits', () => {
    expect(groupedAmount('4863400').text).toBe('4,863,400');
    expect(typing('999|')).toBe('999|');
    expect(typing('9999|')).toBe('9,999|');
    expect(typing('1,5|234')).toBe('15|,234'); // typed in the middle
    expect(typing('1,23|,456')).toBe('123|,456');
    // Deleting a comma only moves past it; deleting a digit regroups.
    expect(typing('4|863,400')).toBe('4|,863,400');
    expect(typing('4,|63,400')).toBe('4|63,400');
    // Zeros left in front stay, so typing over a deleted first digit gives what was meant.
    expect(typing('|,000')).toBe('|000');
    expect(typing('2|000')).toBe('2|,000');
  });

  it('leaves decimals as they are, and drops what is not a digit or the first point', () => {
    expect(groupedAmount('1234.567').text).toBe('1,234.567');
    expect(groupedAmount('12.').text).toBe('12.');
    expect(groupedAmount('1.2.3').text).toBe('1.23');
    expect(groupedAmount(' 1a2b3 4 ').text).toBe('1,234');
    expect(groupedAmount('').text).toBe('');
    expect(typing('1.2.|3')).toBe('1.2|3');
  });
});

describe('validateExpenseForm', () => {
  const validate = (values: ExpenseFormValues) => validateExpenseForm(values, companions, 'KRW');

  it('requires an amount, a category, who paid and who shares; a rate for other currencies', () => {
    expect(validate(blank())).toEqual({
      amount: '금액을 입력해 주세요.',
      category: '카테고리를 골라 주세요.',
      payerIds: '결제한 사람을 한 명 이상 골라 주세요.',
      participants: '함께 낼 사람을 한 명 이상 골라 주세요.',
    });
    expect(Object.keys(validate({ ...blank(), currency: 'JPY' }))).toEqual([
      'amount',
      'rate',
      'category',
      'payerIds',
      'participants',
    ]);
    expect(validate(filled({ payerIds: ['gone'] })).payerIds).toBe(
      '결제한 사람을 한 명 이상 골라 주세요.',
    );
    expect(validate(filled())).toEqual({});
  });

  it('explains amounts it cannot read', () => {
    expect(validate(filled({ amount: '0' })).amount).toBe('0보다 큰 금액을 입력해 주세요.');
    expect(validate(filled({ amount: '12.5' })).amount).toBe(
      '금액을 숫자로 입력해 주세요. 소수점은 쓸 수 없어요.',
    );
    expect(validate(filled({ amount: '12.345', currency: 'USD' })).amount).toBe(
      '금액을 숫자로 입력해 주세요. 소수점 아래 2자리까지 쓸 수 있어요.',
    );
    const badRate = filled({ currency: 'JPY', rate: { rate: '-1', source: 'manual', fetchedAt: null } });
    expect(validate(badRate).rate).toMatch(/0보다 큰 숫자/);
  });

  it('needs at least one person to share it', () => {
    expect(validate(filled({ participantIds: [] }))).toEqual({
      participants: '함께 낼 사람을 한 명 이상 골라 주세요.',
    });
  });

  it('refuses amount splits that do not add up, saying by how much', () => {
    const values = filled({
      splitMethod: 'amount',
      participantIds: [me.id, chulsoo.id],
      shareAmounts: { [me.id]: '3,000', [chulsoo.id]: '2000' },
    });
    expect(validate(values)).toEqual({ shares: '나눈 금액의 합이 총액보다 5,000원 적어요.' });
    expect(validate({ ...values, shareAmounts: { [me.id]: '9000', [chulsoo.id]: '2000' } })).toEqual({
      shares: '나눈 금액의 합이 총액보다 1,000원 많아요.',
    });
  });

  it('refuses ratio weights that are not whole numbers from 1 to 1000', () => {
    for (const weight of ['0', '1.5', '', '1001']) {
      const values = filled({ splitMethod: 'ratio', shareWeights: { [me.id]: weight } });
      expect(validate(values).shares, weight).toBe('비율은 1에서 1,000 사이의 정수로 입력해 주세요.');
    }
  });
});

describe('previewSplit', () => {
  const shares = (values: ExpenseFormValues) =>
    Object.fromEntries(
      [...(previewSplit(values, companions).shares ?? [])].map(([id, amount]) => [
        companions.find((c) => c.id === id)!.name,
        amount,
      ]),
    );

  it('splits equally with the remainder on the payer', () => {
    expect(shares(filled())).toEqual({ 나: 3_334, 철수: 3_333, 영희: 3_333 });
    expect(shares(filled({ payerIds: [chulsoo.id] }))).toEqual({ 나: 3_333, 철수: 3_334, 영희: 3_333 });
  });

  it('gives a payer who is not sharing only the remainder', () => {
    expect(shares(filled({ amount: '10001', participantIds: [chulsoo.id, younghee.id] }))).toEqual({
      철수: 5_000,
      영희: 5_000,
      나: 1,
    });
  });

  it('splits by ratio (weights default to 1)', () => {
    expect(shares(filled({ splitMethod: 'ratio', shareWeights: { [me.id]: '2' } }))).toEqual({
      나: 5_000,
      철수: 2_500,
      영희: 2_500,
    });
  });

  it('adds up typed amounts as they are entered', () => {
    const values = filled({
      splitMethod: 'amount',
      participantIds: [me.id, chulsoo.id],
      shareAmounts: { [me.id]: '4000' },
    });
    expect(previewSplit(values, companions)).toMatchObject({ sum: 4_000, difference: 6_000 });
    expect(previewSplit({ ...values, amount: '' }, companions)).toMatchObject({
      sum: 4_000,
      difference: null,
      shares: null,
    });
  });
});

describe('withSplit', () => {
  const opened = filled({
    amount: '10000',
    splitMethod: 'amount',
    participantIds: [me.id, chulsoo.id],
    shareAmounts: { [me.id]: '7000', [chulsoo.id]: '3000' },
  });
  const method = (changes: Partial<ExpenseFormValues>) =>
    withSplit({ ...opened, ...changes }, opened).splitMethod;

  it('keeps an amount or ratio split while its amount and people are as opened', () => {
    expect(withSplit(opened, opened)).toBe(opened);
    expect(method({ amount: '10,000', payerIds: [chulsoo.id], memo: '저녁' })).toBe('amount');
    expect(method({ participantIds: [chulsoo.id, me.id] })).toBe('amount');
    const ratio = filled({ splitMethod: 'ratio', shareWeights: { [me.id]: '2' } });
    expect(withSplit({ ...ratio, category: 'shopping' }, ratio).splitMethod).toBe('ratio');
  });

  it('splits equally once they change', () => {
    expect(method({ amount: '12000' })).toBe('equal');
    expect(method({ currency: 'JPY' })).toBe('equal');
    expect(method({ participantIds: [me.id] })).toBe('equal');
    expect(method({ participantIds: [me.id, chulsoo.id, younghee.id] })).toBe('equal');
    const changed = withSplit({ ...opened, amount: '12000' }, opened);
    expect(previewSplit(changed, companions).shares).toEqual(
      new Map([
        [me.id, 6_000],
        [chulsoo.id, 6_000],
      ]),
    );
  });
});

describe('form ↔ input', () => {
  it('turns valid values into repository input in companion order', () => {
    const values = filled({
      amount: '12.5',
      currency: 'USD',
      rate: { rate: '1,380.5', source: 'manual', fetchedAt: null },
      splitMethod: 'ratio',
      participantIds: [younghee.id, me.id],
      shareWeights: { [younghee.id]: '3' },
      title: '  택시 ',
      memo: ' 공항에서 호텔까지\n',
    });
    expect(toExpenseInput(values, companions, 'KRW')).toEqual({
      date: '2026-11-11',
      amount: 1_250,
      currency: 'USD',
      exchangeRate: { rate: '1380.5', source: 'manual', fetchedAt: null },
      category: 'food',
      paymentMethod: 'card',
      payerIds: [me.id],
      splitMethod: 'ratio',
      participants: [
        { companionId: me.id, value: 1 },
        { companionId: younghee.id, value: 3 },
      ],
      title: '택시',
      memo: '공항에서 호텔까지',
      scheduleItemId: null,
    });
    expect(toExpenseInput(filled(), companions, 'KRW').exchangeRate).toEqual({
      rate: '1',
      source: 'same',
      fetchedAt: null,
    });
  });

  it('reads a stored expense back into the form', () => {
    const item = makeItem({ tripId: trip.id });
    const expense = makeExpense(
      {
        tripId: trip.id,
        payerIds: [chulsoo.id],
        amount: 1_234,
        currency: 'USD',
        splitMethod: 'amount',
        exchangeRate: { rate: '1380.5', quote: 'KRW', source: 'api', fetchedAt: '2026-11-10T00:00:00.000Z' },
        scheduleItemId: item.id,
      },
      [
        { companionId: me.id, weight: null, amount: 1_000 },
        { companionId: chulsoo.id, weight: null, amount: 234 },
      ],
    );

    const values = toFormValues({ ...expense, title: '택시', memo: '공항에서' }, 'KRW', [item]);
    expect(values).toMatchObject({
      amount: '12.34',
      title: '택시',
      memo: '공항에서',
      rate: { rate: '1380.50', source: 'api', fetchedAt: '2026-11-10T00:00:00.000Z' },
      participantIds: [me.id, chulsoo.id],
      shareAmounts: { [me.id]: '10.00', [chulsoo.id]: '2.34' },
      scheduleItemId: item.id,
    });
    expect(toExpenseInput(values, companions, 'KRW').participants).toEqual([
      { companionId: me.id, value: 1_000 },
      { companionId: chulsoo.id, value: 234 },
    ]);

    // The linked item is gone; the rate was quoted in another currency.
    const stale = toFormValues({ ...expense, exchangeRate: { ...expense.exchangeRate, quote: 'JPY' } }, 'KRW', []);
    expect(stale).toMatchObject({ scheduleItemId: null, rate: { rate: '', source: 'manual' } });
    // ...unless a rate used before can stand in.
    const last = { rate: '1344.5', source: 'last' as const, fetchedAt: null };
    expect(
      toFormValues(
        { ...expense, exchangeRate: { ...expense.exchangeRate, quote: 'JPY' } },
        'KRW',
        [],
        new Map([['USD', last]]),
      ).rate,
    ).toEqual(last);
  });
});
