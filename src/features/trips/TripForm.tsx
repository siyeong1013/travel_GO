import { type FormEvent, useState } from 'react';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import {
  TITLE_MAX_LENGTH,
  TRIP_FORM_FIELDS,
  type TripFormValues,
  validateTripForm,
  withStartDate,
} from '@/features/trips/tripForm';
import { errorMessage } from '@/lib/errorMessage';
import { formatTripLength } from '@/lib/format';

interface TripFormProps {
  initialValues: TripFormValues;
  submitLabel: string;
  /** Errors thrown here are shown above the submit button. */
  onSubmit: (values: TripFormValues) => Promise<void>;
}

export function TripForm({ initialValues, submitLabel, onSubmit }: TripFormProps) {
  const [values, setValues] = useState(initialValues);
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const errors = validateTripForm(values);
  const visibleErrors = showErrors ? errors : {};
  const update = (field: keyof TripFormValues, value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const firstInvalid = TRIP_FORM_FIELDS.find((field) => errors[field]);
    if (firstInvalid) {
      setShowErrors(true);
      (event.currentTarget.elements.namedItem(firstInvalid) as HTMLElement | null)?.focus();
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(values);
    } catch (error) {
      console.error(error);
      setSubmitError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  const datesValid = !errors.startDate && !errors.endDate;

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-5 px-4 py-6">
        <TextField
          label="여행 이름"
          name="title"
          placeholder="예: 오사카 먹방 여행"
          maxLength={TITLE_MAX_LENGTH}
          autoComplete="off"
          enterKeyHint="next"
          value={values.title}
          onChange={(e) => update('title', e.target.value)}
          error={visibleErrors.title}
        />
        <TextField
          label="도시"
          name="city"
          placeholder="예: 오사카"
          autoComplete="off"
          enterKeyHint="next"
          value={values.city}
          onChange={(e) => update('city', e.target.value)}
          error={visibleErrors.city}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="시작일"
            name="startDate"
            type="date"
            value={values.startDate}
            onChange={(e) => setValues((current) => withStartDate(current, e.target.value))}
            error={visibleErrors.startDate}
          />
          <TextField
            label="종료일"
            name="endDate"
            type="date"
            min={values.startDate || undefined}
            value={values.endDate}
            onChange={(e) => update('endDate', e.target.value)}
            error={visibleErrors.endDate}
          />
        </div>
        {datesValid && (
          <p className="-mt-2 text-sm font-semibold text-brand-600">
            {formatTripLength(values.startDate, values.endDate)}
          </p>
        )}
      </div>

      <BottomActionBar>
        {submitError && (
          <p role="alert" className="mb-2 text-center text-sm text-red-500">
            {submitError}
          </p>
        )}
        <Button type="submit" block disabled={submitting}>
          {submitLabel}
        </Button>
      </BottomActionBar>
    </form>
  );
}
