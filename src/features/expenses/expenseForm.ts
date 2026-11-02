import type {
  Companion,
  CurrencyCode,
  ExchangeRateSource,
  ExpenseCategory,
  ExpenseWithShares,
  ID,
  ISODateTime,
  LocalDate,
  PaymentMethod,
  ScheduleItem,
  SplitMethod,
  Trip,
} from '@/data/models';
import type { ExpenseInput } from '@/data/repositories';
import {
  convertAmount,
  currencyDigits,
  isRate,
  parseAmount,
  parseMinorUnits,
  toDecimalString,
} from '@/data/rules/money';
import {
  MAX_WEIGHT,
  participantsFromShares,
  type SplitError,
  type SplitParticipant,
  splitExpense,
} from '@/data/rules/split';
import { isDateInRange, isLocalDate } from '@/lib/dates';
import { formatMoney } from '@/lib/format';

/** A rate as typed, and where it came from (`manual` once the user edits it). */
export interface RateDraft {
  rate: string;
  source: Exclude<ExchangeRateSource, 'same'>;
  fetchedAt: ISODateTime | null;
}

export interface ExpenseFormValues {
  /** As typed, e.g. `"1,200"` or `"12.5"`. */
  amount: string;
  currency: CurrencyCode;
  /** Used only when `currency` isn't the trip's settlement currency. */
  rate: RateDraft;
  category: ExpenseCategory | null;
  date: string;
  paymentMethod: PaymentMethod;
  payerId: ID;
  splitMethod: SplitMethod;
  participantIds: ID[];
  /** Typed per person, kept while switching methods: amounts for `amount`, weights for `ratio`. */
  shareAmounts: Record<ID, string>;
  shareWeights: Record<ID, string>;
  memo: string;
  scheduleItemId: ID | null;
}

export type ExpenseFormField = 'amount' | 'rate' | 'category' | 'date' | 'participants' | 'shares';

/** Fields in screen order, to focus the first invalid one. Also the inputs' `name`s. */
export const EXPENSE_FORM_FIELDS: readonly ExpenseFormField[] = [
  'amount',
  'rate',
  'category',
  'date',
  'participants',
  'shares',
];

export type ExpenseFormErrors = Partial<Record<ExpenseFormField, string>>;

export const MEMO_MAX_LENGTH = 100;

const EMPTY_RATE: RateDraft = { rate: '', source: 'manual', fetchedAt: null };

const NO_PARTICIPANTS = '함께 낼 사람을 한 명 이상 골라 주세요.';
const RATIO_ERROR = `비율은 1에서 ${MAX_WEIGHT.toLocaleString('en-US')} 사이의 정수로 입력해 주세요.`;

/** The rate of the latest expense in each currency, quoted in the settlement currency. */
export function lastRates(
  expenses: ExpenseWithShares[],
  settlementCurrency: CurrencyCode,
): Map<CurrencyCode, RateDraft> {
  const rates = new Map<CurrencyCode, RateDraft>();
  const byCreation = [...expenses].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  for (const { currency, exchangeRate } of byCreation) {
    if (currency === settlementCurrency || exchangeRate.quote !== settlementCurrency) continue;
    rates.set(currency, { rate: exchangeRate.rate, source: 'last', fetchedAt: exchangeRate.fetchedAt });
  }
  return rates;
}

interface NewExpenseContext {
  trip: Trip;
  companions: Companion[];
  expenses: ExpenseWithShares[];
  today: LocalDate;
  /** Prefills the link and the day. */
  scheduleItem?: ScheduleItem | null;
}

/**
 * Currency and payment method of the latest expense, "나" paying, split equally by everyone.
 * The date is the linked item's day, else today during the trip, else its first day.
 */
export function newExpenseValues({
  trip,
  companions,
  expenses,
  today,
  scheduleItem,
}: NewExpenseContext): ExpenseFormValues {
  const latest = expenses.reduce<ExpenseWithShares | null>(
    (last, expense) => (!last || expense.createdAt > last.createdAt ? expense : last),
    null,
  );
  const currency = latest?.currency ?? trip.settlementCurrency;
  const me = companions.find((c) => c.isMe) ?? companions[0];
  return {
    amount: '',
    currency,
    rate: lastRates(expenses, trip.settlementCurrency).get(currency) ?? EMPTY_RATE,
    category: null,
    date:
      scheduleItem?.date ??
      (isDateInRange(today, trip.startDate, trip.endDate) ? today : trip.startDate),
    paymentMethod: latest?.paymentMethod ?? 'card',
    payerId: me?.id ?? '',
    splitMethod: 'equal',
    participantIds: companions.map((c) => c.id),
    shareAmounts: {},
    shareWeights: {},
    memo: '',
    scheduleItemId: scheduleItem?.id ?? null,
  };
}

/** Values for editing `expense`. Drops a link to an item that no longer exists. */
export function toFormValues(
  expense: ExpenseWithShares,
  settlementCurrency: CurrencyCode,
  scheduleItems: Pick<ScheduleItem, 'id'>[],
): ExpenseFormValues {
  const participants = participantsFromShares(expense.splitMethod, expense.shares);
  const { rate, quote, source, fetchedAt } = expense.exchangeRate;
  const shareAmounts: Record<ID, string> = {};
  const shareWeights: Record<ID, string> = {};
  for (const { companionId, value } of participants) {
    if (expense.splitMethod === 'amount') {
      shareAmounts[companionId] = toDecimalString(value!, expense.currency);
    }
    if (expense.splitMethod === 'ratio') shareWeights[companionId] = String(value);
  }
  return {
    amount: toDecimalString(expense.amount, expense.currency),
    currency: expense.currency,
    // A rate quoted in another currency (from a backup) has to be entered again.
    rate:
      source !== 'same' && quote === settlementCurrency
        ? { rate, source, fetchedAt }
        : EMPTY_RATE,
    category: expense.category,
    date: expense.date,
    paymentMethod: expense.paymentMethod,
    payerId: expense.payerId,
    splitMethod: expense.splitMethod,
    participantIds: participants.map((p) => p.companionId),
    shareAmounts,
    shareWeights,
    memo: expense.memo,
    scheduleItemId: scheduleItems.some((item) => item.id === expense.scheduleItemId)
      ? expense.scheduleItemId
      : null,
  };
}

/** Switches currency, taking the last rate used for it (if any). */
export function withCurrency(
  values: ExpenseFormValues,
  currency: CurrencyCode,
  rates: Map<CurrencyCode, RateDraft>,
): ExpenseFormValues {
  return { ...values, currency, rate: rates.get(currency) ?? EMPTY_RATE };
}

/**
 * Switches the split method. Amount fields that are all empty start from the current split,
 * so they already add up and only need adjusting.
 */
export function withSplitMethod(
  values: ExpenseFormValues,
  method: SplitMethod,
  companions: Companion[],
): ExpenseFormValues {
  const next = { ...values, splitMethod: method };
  if (method !== 'amount') return next;
  const typed = values.participantIds.some((id) => values.shareAmounts[id]?.trim());
  const current = previewSplit(values, companions);
  if (typed || !current.shares) return next;
  const shareAmounts = { ...values.shareAmounts };
  for (const id of values.participantIds) {
    shareAmounts[id] = toDecimalString(current.shares.get(id) ?? 0, values.currency);
  }
  return { ...next, shareAmounts };
}

/** Normalized rate text (`"1,380.50"` → `"1380.50"`), or null when it isn't a positive number. */
export function cleanRateText(text: string): string | null {
  const cleaned = text.replace(/[,\s]/g, '').replace(/^0+(?=\d)/, '');
  return isRate(cleaned) ? cleaned : null;
}

function amountError(text: string, currency: CurrencyCode): string | undefined {
  if (!text.trim()) return '금액을 입력해 주세요.';
  if (parseAmount(text, currency) !== null) return undefined;
  if (parseMinorUnits(text, currency) === 0) return '0보다 큰 금액을 입력해 주세요.';
  const digits = currencyDigits(currency);
  return digits === 0
    ? '금액을 숫자로 입력해 주세요. 소수점은 쓸 수 없어요.'
    : `금액을 숫자로 입력해 주세요. 소수점 아래 ${digits}자리까지 쓸 수 있어요.`;
}

/** Participants in companion order, with their typed values read. */
function readParticipants(
  values: ExpenseFormValues,
  companions: Companion[],
): { participants: SplitParticipant[] } | { error: string } {
  const participants: SplitParticipant[] = [];
  for (const { id } of companions) {
    if (!values.participantIds.includes(id)) continue;
    if (values.splitMethod === 'equal') {
      participants.push({ companionId: id, value: null });
    } else if (values.splitMethod === 'ratio') {
      const text = (values.shareWeights[id] ?? '1').trim();
      if (!/^\d+$/.test(text)) return { error: RATIO_ERROR };
      participants.push({ companionId: id, value: Number(text) });
    } else {
      const text = values.shareAmounts[id]?.trim() || '0';
      const value = parseMinorUnits(text, values.currency);
      if (value === null) return { error: '나눌 금액을 숫자로 입력해 주세요.' };
      participants.push({ companionId: id, value });
    }
  }
  return { participants };
}

function splitErrorMessage(error: SplitError, currency: CurrencyCode): ExpenseFormErrors {
  switch (error.kind) {
    case 'no_participants':
      return { participants: NO_PARTICIPANTS };
    case 'invalid_weight':
      return { shares: RATIO_ERROR };
    case 'sum_mismatch': {
      const gap = formatMoney(Math.abs(error.difference), currency);
      return {
        shares: `나눈 금액의 합이 총액보다 ${gap} ${error.difference > 0 ? '적어요' : '많아요'}.`,
      };
    }
    default:
      return { shares: '나눌 금액을 다시 확인해 주세요.' };
  }
}

export interface SplitPreview {
  /** Each person's share in the expense currency (incl. a payer who only takes the remainder). */
  shares: Map<ID, number> | null;
  /** Amount splits: what the typed amounts add up to, and what is left (total − sum). */
  sum: number | null;
  difference: number | null;
  errors: ExpenseFormErrors;
}

/** Live split for the form: computed shares, or what's wrong with the split. */
export function previewSplit(values: ExpenseFormValues, companions: Companion[]): SplitPreview {
  const empty: SplitPreview = { shares: null, sum: null, difference: null, errors: {} };
  const read = readParticipants(values, companions);
  if ('error' in read) return { ...empty, errors: { shares: read.error } };
  const { participants } = read;
  if (participants.length === 0) {
    return { ...empty, errors: { participants: NO_PARTICIPANTS } };
  }

  const sum =
    values.splitMethod === 'amount' ? participants.reduce((s, p) => s + (p.value ?? 0), 0) : null;
  const total = parseAmount(values.amount, values.currency);
  if (total === null) return { ...empty, sum };

  const result = splitExpense(total, values.payerId, values.splitMethod, participants);
  if (!result.ok) {
    return {
      shares: null,
      sum,
      difference: sum === null ? null : total - sum,
      errors: splitErrorMessage(result.error, values.currency),
    };
  }
  return {
    shares: new Map(result.shares.map((share) => [share.companionId, share.amount])),
    sum,
    difference: sum === null ? null : 0,
    errors: {},
  };
}

/** The amount in the settlement currency, when amount and rate are valid. */
export function previewConverted(
  values: ExpenseFormValues,
  settlementCurrency: CurrencyCode,
): number | null {
  const amount = parseAmount(values.amount, values.currency);
  if (amount === null) return null;
  if (values.currency === settlementCurrency) return amount;
  const rate = cleanRateText(values.rate.rate);
  return rate === null ? null : convertAmount(amount, values.currency, settlementCurrency, rate);
}

/** Every problem at once (shown on submit). */
export function validateExpenseForm(
  values: ExpenseFormValues,
  companions: Companion[],
  settlementCurrency: CurrencyCode,
): ExpenseFormErrors {
  const errors: ExpenseFormErrors = {};
  const amount = amountError(values.amount, values.currency);
  if (amount) errors.amount = amount;
  if (values.currency !== settlementCurrency) {
    if (!values.rate.rate.trim()) errors.rate = '환율을 입력해 주세요.';
    else if (cleanRateText(values.rate.rate) === null) {
      errors.rate = '환율은 0보다 큰 숫자로 입력해 주세요. 소수점 아래 10자리까지 쓸 수 있어요.';
    }
  }
  if (!values.category) errors.category = '카테고리를 골라 주세요.';
  if (!isLocalDate(values.date)) errors.date = '날짜를 선택해 주세요.';
  return { ...errors, ...previewSplit(values, companions).errors };
}

/** Call only with values that passed `validateExpenseForm`. */
export function toExpenseInput(
  values: ExpenseFormValues,
  companions: Companion[],
  settlementCurrency: CurrencyCode,
): ExpenseInput {
  const read = readParticipants(values, companions);
  if ('error' in read) throw new Error(read.error);
  const sameCurrency = values.currency === settlementCurrency;
  return {
    date: values.date,
    amount: parseAmount(values.amount, values.currency)!,
    currency: values.currency,
    exchangeRate: sameCurrency
      ? { rate: '1', source: 'same', fetchedAt: null }
      : { ...values.rate, rate: cleanRateText(values.rate.rate)! },
    category: values.category!,
    paymentMethod: values.paymentMethod,
    payerId: values.payerId,
    splitMethod: values.splitMethod,
    participants: read.participants,
    memo: values.memo.trim(),
    scheduleItemId: values.scheduleItemId,
  };
}
