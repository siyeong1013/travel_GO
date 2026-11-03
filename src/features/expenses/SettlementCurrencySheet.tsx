import { type FormEvent, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/Field';
import type { CurrencyCode, Trip } from '@/data/models';
import { CURRENCY_CODES } from '@/data/rules/money';
import { currencyOptionLabel } from '@/features/expenses/expenseDisplay';
import { useTripStore } from '@/features/trips/tripStore';
import { errorMessage } from '@/lib/errorMessage';
import { formatMoney } from '@/lib/format';

interface SettlementCurrencySheetProps {
  trip: Trip;
  /** Expenses or settlements exist: their rates are quoted in the current currency. */
  locked: boolean;
  onClose: () => void;
}

export function SettlementCurrencySheet({ trip, locked, onClose }: SettlementCurrencySheetProps) {
  const update = useTripStore((state) => state.update);
  const [currency, setCurrency] = useState<CurrencyCode>(trip.settlementCurrency);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (currency === trip.settlementCurrency) return onClose();
    setSaving(true);
    setError(null);
    try {
      await update(trip.id, { settlementCurrency: currency });
      onClose();
    } catch (err) {
      console.error(err);
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <BottomSheet open onClose={onClose} title="정산 통화">
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 px-3 pb-2">
        <p className="-mt-1 text-sm text-gray-500">
          모든 지출을 이 통화로 바꿔서 합계를 내고 정산해요.
        </p>
        <SelectField
          label="정산 통화"
          name="settlementCurrency"
          value={currency}
          disabled={locked}
          onChange={(e) => setCurrency(e.target.value)}
          hint={
            locked
              ? '지출이나 송금 기록이 있어서 바꿀 수 없어요.'
              : '지출을 하나라도 기록하면 바꿀 수 없어요.'
          }
        >
          {CURRENCY_CODES.map((code) => (
            <option key={code} value={code}>
              {currencyOptionLabel(code)}
            </option>
          ))}
        </SelectField>
        {trip.budget !== null && currency !== trip.settlementCurrency && (
          <p role="note" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            정산 통화를 바꾸면 예산({formatMoney(trip.budget, trip.settlementCurrency)})이 지워져요.
            새 통화로 다시 정해 주세요.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}
        {locked ? (
          <Button variant="secondary" block onClick={onClose}>
            닫기
          </Button>
        ) : (
          <Button type="submit" block disabled={saving}>
            저장
          </Button>
        )}
      </form>
    </BottomSheet>
  );
}
