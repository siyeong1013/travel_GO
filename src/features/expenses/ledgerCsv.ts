import type { Companion, ExpenseWithShares, Trip } from '@/data/models';
import { convertExpense } from '@/data/rules/ledger';
import { toDecimalString } from '@/data/rules/money';
import {
  CATEGORY_LABELS,
  dayHeading,
  expenseTitle,
  PAYMENT_LABELS,
} from '@/features/expenses/expenseDisplay';

/**
 * The trip's expenses as a CSV that Excel, Numbers and Google Sheets open: one row per expense
 * (date order), then a total row. Amounts are plain numbers so they add up in the sheet; each
 * person's column is their part in the settlement currency, as the settlement counts it.
 */
export function ledgerCsv(
  trip: Pick<Trip, 'startDate' | 'endDate' | 'settlementCurrency'>,
  companions: Companion[],
  expenses: ExpenseWithShares[],
): string {
  const currency = trip.settlementCurrency;
  const people = [...companions].sort((a, b) => a.order - b.order);
  const nameOf = (id: string) => companions.find((c) => c.id === id)?.name ?? '?';
  const money = (amount: number) => toDecimalString(amount, currency);

  const header = [
    '날짜',
    '일차',
    '제목',
    '카테고리',
    '금액',
    '통화',
    '환율',
    `정산 금액(${currency})`,
    '결제 수단',
    '결제한 사람',
    ...people.map((person) => `${person.name} 몫(${currency})`),
    '메모',
  ];

  let total = 0;
  const totals = new Map(people.map((person) => [person.id, 0]));
  const sorted = [...expenses].sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
  );
  const rows = sorted.map((expense) => {
    const converted = convertExpense(expense, currency);
    if (converted) {
      total += converted.total;
      for (const [id, amount] of converted.owed) totals.set(id, (totals.get(id) ?? 0) + amount);
    }
    return [
      expense.date,
      dayHeading(trip, expense.date).title,
      expenseTitle(expense),
      CATEGORY_LABELS[expense.category],
      toDecimalString(expense.amount, expense.currency),
      expense.currency,
      expense.currency === currency ? '' : expense.exchangeRate.rate,
      // Left empty when the rate is for another currency (the app asks for a new one).
      converted ? money(converted.total) : '',
      PAYMENT_LABELS[expense.paymentMethod],
      expense.payerIds.map(nameOf).join(', '),
      ...people.map((person) => {
        const part = converted?.owed.get(person.id);
        return part ? money(part) : '';
      }),
      expense.memo,
    ];
  });

  const totalRow = [
    '합계',
    '',
    '',
    '',
    '',
    '',
    '',
    money(total),
    '',
    '',
    ...people.map((person) => money(totals.get(person.id) ?? 0)),
    '',
  ];

  // The byte order mark makes Excel read the file as UTF-8 (Korean would break without it).
  return '﻿' + [header, ...rows, totalRow].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

/**
 * One CSV field. Text that a spreadsheet would run as a formula (`=…`, `+…`, `-…`, `@…`) gets a
 * leading `'`, so an expense titled `=HYPERLINK(…)` stays text.
 */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** `오사카 여행 가계부.csv`, without the characters file systems refuse. */
export function ledgerFileName(trip: Pick<Trip, 'title'>): string {
  const title = trip.title.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  return `${title || 'travel GO'} 가계부.csv`;
}
