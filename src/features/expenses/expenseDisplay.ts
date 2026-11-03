import type {
  Companion,
  CurrencyCode,
  Expense,
  ExpenseCategory,
  ExpenseWithShares,
  ID,
  LocalDate,
  PaymentMethod,
  SplitMethod,
  Trip,
} from '@/data/models';
import { convertExpense } from '@/data/rules/ledger';
import { currencyInfo } from '@/data/rules/money';
import { participantsFromShares } from '@/data/rules/split';
import { diffDays } from '@/lib/dates';
import { formatDate } from '@/lib/format';

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  food: '식비',
  transport: '교통',
  lodging: '숙소',
  shopping: '쇼핑',
  sightseeing: '관광',
  other: '기타',
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = { cash: '현금', card: '카드' };

export const SPLIT_LABELS: Record<SplitMethod, string> = {
  equal: '균등',
  amount: '금액 지정',
  ratio: '비율',
};

/** The memo, or the category name when there is none. */
export function expenseTitle(expense: Pick<ExpenseWithShares, 'memo' | 'category'>): string {
  return expense.memo.trim() || CATEGORY_LABELS[expense.category];
}

/** `개인 지출`, `철수 부담`, or `3명 균등`. */
export function splitSummary(expense: ExpenseWithShares, companions: Companion[]): string {
  const participants = participantsFromShares(expense.splitMethod, expense.shares);
  const only = participants.length === 1 ? participants[0]!.companionId : null;
  if (only === expense.payerId) return '개인 지출';
  if (only) return `${companions.find((c) => c.id === only)?.name ?? '?'} 부담`;
  return `${participants.length}명 ${SPLIT_LABELS[expense.splitMethod]}`;
}

/** Whether amounts are converted at rates from the exchange-rate API (whose terms ask for credit). */
export function usesApiRates(expenses: Pick<Expense, 'exchangeRate'>[]): boolean {
  return expenses.some((expense) => expense.exchangeRate.fetchedAt !== null);
}

export interface DayHeading {
  /** `before`, a trip day (`YYYY-MM-DD`), or `after`. */
  key: string;
  /** `여행 전`, `Day 1`, `여행 후`. */
  title: string;
  /** `11.10 (화)` for trip days. */
  subtitle: string | null;
}

/** Where `date` falls: a trip day, or before/after the trip (prepaid flights, souvenirs). */
export function dayHeading(trip: Pick<Trip, 'startDate' | 'endDate'>, date: LocalDate): DayHeading {
  if (date < trip.startDate) return { key: 'before', title: '여행 전', subtitle: null };
  if (date > trip.endDate) return { key: 'after', title: '여행 후', subtitle: null };
  return { key: date, title: `Day ${diffDays(trip.startDate, date) + 1}`, subtitle: formatDate(date) };
}

export interface ExpenseRow {
  expense: ExpenseWithShares;
  /** In the trip's settlement currency; null when the stored rate is for another currency. */
  converted: number | null;
}

export interface ExpenseSection extends DayHeading {
  /** Sum of the convertible rows, in the settlement currency. */
  total: number;
  rows: ExpenseRow[];
}

/**
 * Trip days that have expenses, in order; expenses dated before or after the trip are grouped
 * as `여행 전` / `여행 후`. Rows keep the given order (the repository's: date, then createdAt).
 */
export function groupExpenses(
  trip: Pick<Trip, 'startDate' | 'endDate' | 'settlementCurrency'>,
  expenses: ExpenseWithShares[],
): ExpenseSection[] {
  const sections = new Map<string, ExpenseSection>();
  const sectionFor = (date: LocalDate): ExpenseSection => {
    const heading = dayHeading(trip, date);
    let section = sections.get(heading.key);
    if (!section) {
      section = { ...heading, total: 0, rows: [] };
      sections.set(heading.key, section);
    }
    return section;
  };

  for (const expense of expenses) {
    const converted = convertExpense(expense, trip.settlementCurrency)?.total ?? null;
    const section = sectionFor(expense.date);
    section.rows.push({ expense, converted });
    section.total += converted ?? 0;
  }
  const order = (key: string) => (key === 'before' ? '0' : key === 'after' ? '2' : `1${key}`);
  return [...sections.values()].sort((a, b) => (order(a.key) < order(b.key) ? -1 : 1));
}

export type BlockReason = 'payer' | 'amount' | 'only';

export const BLOCK_REASON_LABELS: Record<BlockReason, string> = {
  payer: '결제자',
  amount: '금액 지정 분담',
  only: '혼자 부담',
};

/** Why an expense keeps `companionId` from being deleted (see `CompanionUsage`). */
export function blockReason(expense: ExpenseWithShares, companionId: ID): BlockReason {
  if (expense.payerId === companionId) return 'payer';
  return expense.splitMethod === 'amount' ? 'amount' : 'only';
}

/** `JPY · 엔`, for currency pickers. */
export function currencyOptionLabel(code: CurrencyCode): string {
  return `${code} · ${currencyInfo(code).label}`;
}
