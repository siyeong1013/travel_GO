import type {
  Companion,
  CurrencyCode,
  ExchangeRateSnapshot,
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
import type { ExpenseInput, UsedRate } from '@/data/repositories';
import {
  convertAmount,
  currencyDigits,
  isRate,
  parseAmount,
  parseMinorUnits,
  roundRate,
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
  /** Ticked as paying: several paid it in equal parts. */
  payerIds: ID[];
  /** `equal`, but for an expense split by amounts or ratios (as the form once could): `withSplit`. */
  splitMethod: SplitMethod;
  participantIds: ID[];
  /** That expense's split, per person: amounts for `amount`, weights for `ratio`. */
  shareAmounts: Record<ID, string>;
  shareWeights: Record<ID, string>;
  memo: string;
  scheduleItemId: ID | null;
}

export type ExpenseFormField =
  | 'amount'
  | 'rate'
  | 'category'
  | 'date'
  | 'payerIds'
  | 'participants'
  | 'shares';

/** Fields in screen order, to focus the first invalid one. Also the inputs' `name`s. */
export const EXPENSE_FORM_FIELDS: readonly ExpenseFormField[] = [
  'amount',
  'rate',
  'category',
  'date',
  'payerIds',
  'participants',
  'shares',
];

export type ExpenseFormErrors = Partial<Record<ExpenseFormField, string>>;

export const MEMO_MAX_LENGTH = 100;

const EMPTY_RATE: RateDraft = { rate: '', source: 'manual', fetchedAt: null };

const NO_PARTICIPANTS = '함께 낼 사람을 한 명 이상 골라 주세요.';
const RATIO_ERROR = `비율은 1에서 ${MAX_WEIGHT.toLocaleString('en-US')} 사이의 정수로 입력해 주세요.`;

/** A stored rate as the form shows it: rounded (`roundRate`) unless it was typed. */
function shownRate({ rate, source }: Pick<ExchangeRateSnapshot, 'rate' | 'source'>): string {
  return source === 'manual' ? rate : roundRate(rate);
}

/**
 * The rate to start from in each currency, quoted in the settlement currency: the latest one
 * used in this trip (`expenses`), else the latest one used in any trip (`elsewhere`).
 */
export function lastRates(
  expenses: UsedRate[],
  settlementCurrency: CurrencyCode,
  elsewhere: UsedRate[] = [],
): Map<CurrencyCode, RateDraft> {
  const rates = new Map<CurrencyCode, RateDraft>();
  const byCreation = (list: UsedRate[]) =>
    [...list].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  // Later entries win: this trip's after the others.
  for (const { currency, exchangeRate } of [...byCreation(elsewhere), ...byCreation(expenses)]) {
    if (currency === settlementCurrency || exchangeRate.quote !== settlementCurrency) continue;
    rates.set(currency, {
      rate: shownRate(exchangeRate),
      source: 'last',
      fetchedAt: exchangeRate.fetchedAt,
    });
  }
  return rates;
}

interface NewExpenseContext {
  trip: Trip;
  expenses: ExpenseWithShares[];
  today: LocalDate;
  /** Rates to start from (`lastRates`); this trip's own by default. */
  rates?: Map<CurrencyCode, RateDraft>;
  /** Prefills the link and the day. */
  scheduleItem?: ScheduleItem | null;
}

/**
 * Currency and payment method of the latest expense; nobody paying or sharing until ticked in
 * the form. The date is the linked item's day, else today during the trip, else its first day.
 */
export function newExpenseValues({
  trip,
  expenses,
  today,
  rates = lastRates(expenses, trip.settlementCurrency),
  scheduleItem,
}: NewExpenseContext): ExpenseFormValues {
  const latest = expenses.reduce<ExpenseWithShares | null>(
    (last, expense) => (!last || expense.createdAt > last.createdAt ? expense : last),
    null,
  );
  const currency = latest?.currency ?? trip.settlementCurrency;
  return {
    amount: '',
    currency,
    rate: rates.get(currency) ?? EMPTY_RATE,
    category: null,
    date:
      scheduleItem?.date ??
      (isDateInRange(today, trip.startDate, trip.endDate) ? today : trip.startDate),
    paymentMethod: latest?.paymentMethod ?? 'card',
    payerIds: [],
    splitMethod: 'equal',
    participantIds: [],
    shareAmounts: {},
    shareWeights: {},
    memo: '',
    scheduleItemId: scheduleItem?.id ?? null,
  };
}

/**
 * Values for editing `expense`. Drops a link to an item that no longer exists, and a rate quoted
 * in another currency (taking the one from `rates` instead, if any).
 */
export function toFormValues(
  expense: ExpenseWithShares,
  settlementCurrency: CurrencyCode,
  scheduleItems: Pick<ScheduleItem, 'id'>[],
  rates: Map<CurrencyCode, RateDraft> = new Map(),
): ExpenseFormValues {
  const participants = participantsFromShares(expense.splitMethod, expense.shares);
  const { quote, source, fetchedAt } = expense.exchangeRate;
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
        ? { rate: shownRate(expense.exchangeRate), source, fetchedAt }
        : (rates.get(expense.currency) ?? EMPTY_RATE),
    category: expense.category,
    date: expense.date,
    paymentMethod: expense.paymentMethod,
    payerIds: [...expense.payerIds],
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
 * The values with the split they are saved with. The form splits equally; an expense split by
 * amounts or ratios (as the form once could) keeps its split while its amount and the people
 * sharing it are the ones it was `opened` with.
 */
export function withSplit(values: ExpenseFormValues, opened: ExpenseFormValues): ExpenseFormValues {
  if (values.splitMethod === 'equal') return values;
  const people = new Set(opened.participantIds);
  const unchanged =
    values.currency === opened.currency &&
    parseAmount(values.amount, values.currency) === parseAmount(opened.amount, opened.currency) &&
    values.participantIds.length === people.size &&
    values.participantIds.every((id) => people.has(id));
  return unchanged ? values : { ...values, splitMethod: 'equal' };
}

/** Normalized rate text (`"1,380.50"` → `"1380.50"`), or null when it isn't a positive number. */
export function cleanRateText(text: string): string | null {
  const cleaned = text.replace(/[,\s]/g, '').replace(/^0+(?=\d)/, '');
  return isRate(cleaned) ? cleaned : null;
}

/** What is wrong with a typed amount of `currency`, if anything. */
export function amountError(text: string, currency: CurrencyCode): string | undefined {
  if (!text.trim()) return '금액을 입력해 주세요.';
  if (parseAmount(text, currency) !== null) return undefined;
  if (parseMinorUnits(text, currency) === 0) return '0보다 큰 금액을 입력해 주세요.';
  const digits = currencyDigits(currency);
  return digits === 0
    ? '금액을 숫자로 입력해 주세요. 소수점은 쓸 수 없어요.'
    : `금액을 숫자로 입력해 주세요. 소수점 아래 ${digits}자리까지 쓸 수 있어요.`;
}

/** Those ticked as paying, in companion order: the first one sharing carries the remainder. */
function payersOf(values: ExpenseFormValues, companions: Companion[]): ID[] {
  return companions.filter((c) => values.payerIds.includes(c.id)).map((c) => c.id);
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

  const result = splitExpense(total, payersOf(values, companions), values.splitMethod, participants);
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
  if (payersOf(values, companions).length === 0) {
    errors.payerIds = '결제한 사람을 한 명 이상 골라 주세요.';
  }
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
    payerIds: payersOf(values, companions),
    splitMethod: values.splitMethod,
    participants: read.participants,
    memo: values.memo.trim(),
    scheduleItemId: values.scheduleItemId,
  };
}
