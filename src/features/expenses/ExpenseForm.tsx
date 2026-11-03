import {
  type FormEvent,
  Fragment,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useId,
  useState,
} from 'react';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { ChoiceGroup } from '@/components/ui/ChoiceGroup';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { SelectField, TextField } from '@/components/ui/Field';
import { controlClass } from '@/components/ui/fieldClass';
import { TrashIcon } from '@/components/ui/icons';
import type {
  Companion,
  CurrencyCode,
  ExpenseCategory,
  ID,
  PaymentMethod,
  ScheduleItem,
  SplitMethod,
  Trip,
} from '@/data/models';
import type { ExpenseInput } from '@/data/repositories';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, SPLIT_METHODS } from '@/data/rules/expense';
import { CURRENCY_CODES, currencyDigits, currencyInfo, parseAmount } from '@/data/rules/money';
import { itemsOn } from '@/data/rules/schedule';
import {
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  currencyOptionLabel,
  PAYMENT_LABELS,
  SPLIT_LABELS,
} from '@/features/expenses/expenseDisplay';
import {
  EXPENSE_FORM_FIELDS,
  type ExpenseFormValues,
  MEMO_MAX_LENGTH,
  previewConverted,
  previewSplit,
  type RateDraft,
  toExpenseInput,
  validateExpenseForm,
  withCurrency,
  withSplitMethod,
} from '@/features/expenses/expenseForm';
import { RateSourceLink } from '@/features/expenses/RateAttribution';
import { useRateStore } from '@/features/expenses/rateStore';
import { buildDayTabs, tabLabel } from '@/features/schedule/dayTabs';
import { errorMessage } from '@/lib/errorMessage';
import type { LatestRates } from '@/lib/exchangeRateApi';
import { formatDateTime, formatMoney } from '@/lib/format';

interface ExpenseFormProps {
  trip: Trip;
  companions: Companion[];
  scheduleItems: ScheduleItem[];
  /** Last rate used per currency (`lastRates`), offered when switching currency. */
  rates: Map<CurrencyCode, RateDraft>;
  initialValues: ExpenseFormValues;
  /**
   * Looks up the latest API rate on open: for new expenses, or a rate that has to be entered
   * again. Switching currency always does.
   */
  fetchRateOnOpen?: boolean;
  /** Shown above the form, e.g. why the rate has to be entered again. */
  notice?: string;
  /** Errors thrown here are shown above the submit button. */
  onSubmit: (input: ExpenseInput) => Promise<void>;
  /** Adds a delete button (editing). Errors thrown here are shown in the confirmation. */
  onDelete?: () => Promise<void>;
}

const CATEGORY_OPTIONS = EXPENSE_CATEGORIES.map((category) => ({
  value: category,
  label: (
    <>
      <span aria-hidden="true">{CATEGORY_ICONS[category]}</span>
      {CATEGORY_LABELS[category]}
    </>
  ),
}));
const PAYMENT_OPTIONS = PAYMENT_METHODS.map((method) => ({
  value: method,
  label: PAYMENT_LABELS[method],
}));
const SPLIT_OPTIONS = SPLIT_METHODS.map((method) => ({ value: method, label: SPLIT_LABELS[method] }));

type RateLookupStatus = 'loading' | 'failed';

/** Full-screen form for one expense: amount, rate, category, payer and the split. */
export function ExpenseForm({
  trip,
  companions,
  scheduleItems,
  rates,
  initialValues,
  fetchRateOnOpen = false,
  notice,
  onSubmit,
  onDelete,
}: ExpenseFormProps) {
  const settlement = trip.settlementCurrency;
  const fetchLatest = useRateStore((state) => state.fetchLatest);
  const [values, setValues] = useState(initialValues);
  const [lookup, setLookup] = useState<{ currency: CurrencyCode; status: RateLookupStatus } | null>(
    () =>
      fetchRateOnOpen && initialValues.currency !== settlement
        ? { currency: initialValues.currency, status: 'loading' }
        : null,
  );
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const splitErrorId = useId();

  /**
   * Puts the latest API rate for `currency` into the form, unless the currency or the rate has
   * changed since it was asked for (`from`: the rate then). Typing always wins.
   */
  function applyLatest(currency: CurrencyCode, from: RateDraft, latest: LatestRates | null) {
    const rate = latest?.rates[settlement];
    setLookup((current) =>
      current?.currency !== currency ? current : rate ? null : { currency, status: 'failed' },
    );
    if (!latest || !rate) return;
    setValues((current) =>
      current.currency === currency && current.rate === from
        ? { ...current, rate: { rate, source: 'api', fetchedAt: latest.updatedAt } }
        : current,
    );
  }

  function lookUpRate(currency: CurrencyCode, from: RateDraft) {
    setLookup({ currency, status: 'loading' });
    void fetchLatest(currency).then((latest) => applyLatest(currency, from, latest));
  }

  // `lookup` starts as loading when the form should look the rate up on open.
  const lookUpOnOpen = useEffectEvent(() => {
    if (lookup?.status !== 'loading') return;
    const { currency, rate } = values;
    void fetchLatest(currency).then((latest) => applyLatest(currency, rate, latest));
  });
  useEffect(() => {
    lookUpOnOpen();
  }, []);

  function changeCurrency(currency: CurrencyCode) {
    const next = withCurrency(values, currency, rates);
    setValues(next);
    if (currency === settlement) setLookup(null);
    else lookUpRate(currency, next.rate);
  }

  const rateLookup = lookup?.currency === values.currency ? lookup.status : null;
  const digits = currencyDigits(values.currency);
  const errors = validateExpenseForm(values, companions, settlement);
  const visibleErrors = showErrors ? errors : {};
  const amount = parseAmount(values.amount, values.currency);
  const split = previewSplit(values, companions);
  const converted = previewConverted(values, settlement);
  const set = (patch: Partial<ExpenseFormValues>) =>
    setValues((current) => ({ ...current, ...patch }));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const firstInvalid = EXPENSE_FORM_FIELDS.find((field) => errors[field]);
    if (firstInvalid) {
      setShowErrors(true);
      event.currentTarget.querySelector<HTMLElement>(`[name="${firstInvalid}"]`)?.focus();
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(toExpenseInput(values, companions, settlement));
    } catch (error) {
      console.error(error);
      setSubmitError(errorMessage(error));
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    setSubmitting(true);
    setDeleteError(null);
    try {
      await onDelete!();
    } catch (error) {
      console.error(error);
      setDeleteError(errorMessage(error));
      setSubmitting(false);
    }
  }

  function toggleParticipant(id: ID) {
    const selected = values.participantIds.includes(id);
    set({
      participantIds: selected
        ? values.participantIds.filter((other) => other !== id)
        : [...values.participantIds, id],
    });
  }

  const tabs = buildDayTabs(trip, scheduleItems);

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-6 px-4 py-5">
        {notice && (
          <p role="note" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {notice}
          </p>
        )}

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[minmax(0,1fr)_8.5rem] gap-3">
            <TextField
              label="금액"
              name="amount"
              inputMode={digits === 0 ? 'numeric' : 'decimal'}
              placeholder="0"
              autoComplete="off"
              enterKeyHint="next"
              className="[&_input]:text-xl [&_input]:font-semibold"
              value={values.amount}
              onChange={(e) => set({ amount: e.target.value })}
              error={visibleErrors.amount}
              hint={amount === null ? undefined : formatMoney(amount, values.currency)}
            />
            <SelectField
              label="통화"
              name="currency"
              value={values.currency}
              onChange={(e) => changeCurrency(e.target.value)}
            >
              {CURRENCY_CODES.map((code) => (
                <option key={code} value={code}>
                  {currencyOptionLabel(code)}
                </option>
              ))}
            </SelectField>
          </div>

          {values.currency !== settlement && (
            <TextField
              label={`환율 (1 ${values.currency}당 ${currencyInfo(settlement).label})`}
              name="rate"
              inputMode="decimal"
              placeholder="예: 9.04"
              autoComplete="off"
              value={values.rate.rate}
              onChange={(e) =>
                set({ rate: { rate: e.target.value, source: 'manual', fetchedAt: null } })
              }
              error={visibleErrors.rate}
              hint={rateHint(values.rate, converted, settlement, rateLookup)}
              action={
                <button
                  type="button"
                  disabled={rateLookup === 'loading'}
                  onClick={() => lookUpRate(values.currency, values.rate)}
                  className="-my-3 -mr-2 h-11 shrink-0 rounded-lg px-2 text-sm font-semibold text-brand-600 active:bg-brand-50 disabled:text-gray-400"
                >
                  최신 환율 불러오기
                </button>
              }
            />
          )}
        </div>

        <ChoiceGroup<ExpenseCategory>
          legend="카테고리"
          name="category"
          columns={3}
          options={CATEGORY_OPTIONS}
          value={values.category}
          onChange={(category) => set({ category })}
          error={visibleErrors.category}
        />

        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="날짜"
            name="date"
            type="date"
            value={values.date}
            onChange={(e) => set({ date: e.target.value })}
            error={visibleErrors.date}
          />
          <ChoiceGroup<PaymentMethod>
            legend="결제 수단"
            name="paymentMethod"
            columns={2}
            options={PAYMENT_OPTIONS}
            value={values.paymentMethod}
            onChange={(paymentMethod) => set({ paymentMethod })}
          />
        </div>

        <ChoiceGroup<ID>
          legend="결제한 사람"
          name="payerId"
          options={companions.map((c) => ({ value: c.id, label: c.name }))}
          value={values.payerId}
          onChange={(payerId) => set({ payerId })}
        />

        <div className="flex flex-col gap-3">
          <ChoiceGroup<SplitMethod>
            legend="나누는 방법"
            name="splitMethod"
            columns={3}
            options={SPLIT_OPTIONS}
            value={values.splitMethod}
            onChange={(method) =>
              setValues((current) => withSplitMethod(current, method, companions))
            }
          />
          <fieldset
            className="relative flex min-w-0 flex-col"
            aria-describedby={
              visibleErrors.participants || visibleErrors.shares ? splitErrorId : undefined
            }
          >
            <legend className="float-left min-h-5 text-sm font-semibold text-gray-700">
              함께 낼 사람
            </legend>
            <div className="absolute -top-3 right-0 flex">
              <QuickButton onClick={() => set({ participantIds: companions.map((c) => c.id) })}>
                모두
              </QuickButton>
              <QuickButton onClick={() => set({ participantIds: [values.payerId] })}>
                결제한 사람만
              </QuickButton>
            </div>
            <ul className="clear-left mt-1 divide-y divide-gray-100">
              {companions.map((companion) => (
                <ParticipantRow
                  key={companion.id}
                  companion={companion}
                  values={values}
                  share={split.shares?.get(companion.id)}
                  invalid={Boolean(visibleErrors.shares)}
                  onToggle={() => toggleParticipant(companion.id)}
                  onValue={(text) =>
                    set(
                      values.splitMethod === 'amount'
                        ? { shareAmounts: { ...values.shareAmounts, [companion.id]: text } }
                        : { shareWeights: { ...values.shareWeights, [companion.id]: text } },
                    )
                  }
                />
              ))}
            </ul>
            {values.splitMethod === 'amount' && split.sum !== null && (
              <AmountSplitTotal
                currency={values.currency}
                sum={split.sum}
                total={amount}
              />
            )}
            {(visibleErrors.participants ?? visibleErrors.shares) && (
              <p id={splitErrorId} className="mt-1.5 text-sm text-red-500">
                {visibleErrors.participants ?? visibleErrors.shares}
              </p>
            )}
          </fieldset>
        </div>

        <TextField
          label="메모"
          name="memo"
          placeholder="예: 타코야키"
          autoComplete="off"
          maxLength={MEMO_MAX_LENGTH}
          value={values.memo}
          onChange={(e) => set({ memo: e.target.value })}
        />

        {scheduleItems.length > 0 && (
          <SelectField
            label="일정 연결"
            name="scheduleItemId"
            value={values.scheduleItemId ?? ''}
            onChange={(e) => set({ scheduleItemId: e.target.value || null })}
            hint="어느 장소에서 쓴 돈인지 남겨 둘 수 있어요."
          >
            <option value="">연결 안 함</option>
            {tabs.map((tab) => {
              const items = itemsOn(scheduleItems, tab.date);
              return items.length === 0 ? null : (
                <optgroup key={tab.key} label={tabLabel(tab)}>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.place.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </SelectField>
        )}
      </div>

      <BottomActionBar>
        {submitError && (
          <p role="alert" className="mb-2 text-center text-sm text-red-500">
            {submitError}
          </p>
        )}
        <div className="flex gap-2">
          {onDelete && (
            <Button
              variant="secondary"
              aria-label="지출 삭제"
              className="shrink-0 px-4 text-red-500"
              disabled={submitting}
              onClick={() => setConfirmingDelete(true)}
            >
              <TrashIcon width={20} height={20} />
            </Button>
          )}
          <Button type="submit" block disabled={submitting}>
            저장
          </Button>
        </div>
      </BottomActionBar>

      <ConfirmSheet
        open={confirmingDelete}
        title="이 지출을 삭제할까요?"
        description="되돌릴 수 없어요."
        confirmLabel="삭제"
        tone="danger"
        busy={submitting}
        error={deleteError}
        onConfirm={() => void handleDelete()}
        onClose={() => {
          setConfirmingDelete(false);
          setDeleteError(null);
        }}
      />
    </form>
  );
}

/** The converted amount, where the rate came from, and how the latest-rate lookup is going. */
function rateHint(
  rate: RateDraft,
  converted: number | null,
  settlement: CurrencyCode,
  lookup: RateLookupStatus | null,
): ReactNode {
  const parts: string[] = [];
  if (converted !== null) parts.push(`≈ ${formatMoney(converted, settlement)}`);
  if (rate.source === 'last') parts.push('마지막으로 쓴 환율');
  // From the API (now, or reused): when it was published, and the credit below.
  if (rate.fetchedAt) parts.push(`${formatDateTime(rate.fetchedAt)} 기준`);
  if (lookup === 'loading') parts.push('최신 환율 불러오는 중…');
  if (lookup === 'failed') {
    parts.push(
      rate.rate.trim()
        ? '최신 환율을 불러오지 못했어요'
        : '최신 환율을 불러오지 못했어요. 직접 입력해 주세요.',
    );
  }
  if (parts.length === 0) return undefined;
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={part}>
          {i > 0 && ' · '}
          <span>{part}</span>
        </Fragment>
      ))}
      {rate.fetchedAt && (
        <span className="block">
          <RateSourceLink />
        </span>
      )}
    </>
  );
}

function QuickButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-11 rounded-lg px-2 text-sm font-semibold text-brand-600 active:bg-brand-50"
    >
      {children}
    </button>
  );
}

interface ParticipantRowProps {
  companion: Companion;
  values: ExpenseFormValues;
  /** Computed share in the expense currency (equal and ratio splits). */
  share: number | undefined;
  invalid: boolean;
  onToggle: () => void;
  onValue: (text: string) => void;
}

function ParticipantRow({ companion, values, share, invalid, onToggle, onValue }: ParticipantRowProps) {
  const selected = values.participantIds.includes(companion.id);
  const isPayer = values.payerId === companion.id;
  const inputClass = `h-11 px-3 text-right tabular-nums ${controlClass}`;

  return (
    <li className="flex min-h-13 items-center gap-2 py-1">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-2">
        <input
          type="checkbox"
          name="participants"
          checked={selected}
          onChange={onToggle}
          className="size-5 shrink-0 accent-brand-500"
        />
        <span className="truncate text-base">{companion.name}</span>
        {isPayer && (
          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
            결제
          </span>
        )}
      </label>
      {/* Fixed-width boxes: the inputs themselves are w-full. */}
      {selected && values.splitMethod === 'amount' && (
        <div className="w-32 shrink-0">
          <input
            name="shares"
            aria-label={`${companion.name} 금액`}
            aria-invalid={invalid || undefined}
            inputMode={currencyDigits(values.currency) === 0 ? 'numeric' : 'decimal'}
            autoComplete="off"
            placeholder="0"
            className={inputClass}
            value={values.shareAmounts[companion.id] ?? ''}
            onChange={(e) => onValue(e.target.value)}
          />
        </div>
      )}
      {selected && values.splitMethod === 'ratio' && (
        <div className="w-16 shrink-0">
          <input
            name="shares"
            aria-label={`${companion.name} 비율`}
            aria-invalid={invalid || undefined}
            inputMode="numeric"
            autoComplete="off"
            className={inputClass}
            value={values.shareWeights[companion.id] ?? '1'}
            onChange={(e) => onValue(e.target.value)}
          />
        </div>
      )}
      {values.splitMethod !== 'amount' && share !== undefined && (
        <span
          className={`w-24 shrink-0 text-right text-sm tabular-nums ${selected ? 'text-gray-700' : 'text-gray-400'}`}
        >
          {selected ? '' : '나머지 '}
          {formatMoney(share, values.currency)}
        </span>
      )}
    </li>
  );
}

interface AmountSplitTotalProps {
  currency: CurrencyCode;
  /** What the typed amounts add up to. */
  sum: number;
  /** The expense amount; null while it isn't valid. */
  total: number | null;
}

/** Live check of an amount split: how much is left to assign (or over). */
function AmountSplitTotal({ currency, sum, total }: AmountSplitTotalProps) {
  const difference = total === null ? null : total - sum;
  return (
    <p className="mt-2 flex justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2.5 text-sm text-gray-600">
      <span className="tabular-nums">
        합계 {formatMoney(sum, currency)}
        {total !== null && ` / ${formatMoney(total, currency)}`}
      </span>
      {difference === 0 && <span className="font-semibold text-brand-600">총액과 같아요</span>}
      {difference !== null && difference !== 0 && (
        <span className="font-semibold text-red-500 tabular-nums">
          {formatMoney(Math.abs(difference), currency)} {difference > 0 ? '남음' : '초과'}
        </span>
      )}
    </p>
  );
}
