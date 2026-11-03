import { type FormEvent, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import type { Trip } from '@/data/models';
import { currencyDigits, currencyInfo } from '@/data/rules/money';
import { budgetText, readBudget } from '@/features/expenses/budgetForm';
import { useTripStore } from '@/features/trips/tripStore';
import { errorMessage } from '@/lib/errorMessage';
import { formatMoney } from '@/lib/format';

/** The whole trip's budget (everyone's spending), in the settlement currency. Empty removes it. */
export function BudgetSheet({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const update = useTripStore((state) => state.update);
  const currency = trip.settlementCurrency;
  const [text, setText] = useState(budgetText(trip.budget, currency));
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const read = readBudget(text, currency);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ('error' in read) {
      setFieldError(read.error);
      event.currentTarget.querySelector<HTMLElement>('[name="budget"]')?.focus();
      return;
    }
    // Unchanged: no write (updatedAt decides backup merges).
    if (read.budget === trip.budget) return onClose();
    setSaving(true);
    setError(null);
    try {
      await update(trip.id, { budget: read.budget });
      onClose();
    } catch (err) {
      console.error(err);
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <BottomSheet open onClose={onClose} title="예산">
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 px-3 pb-2">
        <p className="-mt-1 text-sm text-gray-500">
          동행자 모두의 지출을 합쳐서 여행 전체 예산과 비교해요.
        </p>
        <TextField
          label={`여행 예산 (${currencyInfo(currency).label})`}
          name="budget"
          inputMode={currencyDigits(currency) === 0 ? 'numeric' : 'decimal'}
          placeholder="예산 없음"
          autoComplete="off"
          enterKeyHint="done"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setFieldError(undefined);
          }}
          error={fieldError}
          hint={
            'budget' in read && read.budget !== null
              ? formatMoney(read.budget, currency)
              : '비워 두고 저장하면 예산 없이 기록해요.'
          }
        />
        {error && (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}
        <Button type="submit" block disabled={saving}>
          저장
        </Button>
      </form>
    </BottomSheet>
  );
}
