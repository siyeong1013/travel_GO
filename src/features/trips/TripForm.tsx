import { type FormEvent, useState } from 'react';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import type { PlaceSuggestion } from '@/features/places/placeSearch';
import { PlaceSuggestionList } from '@/features/places/PlaceSuggestionList';
import { usePlaceSearch } from '@/features/places/usePlaceSearch';
import {
  linkedCity,
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
  // City search starts once the field is typed in (not for a saved trip's city on opening).
  const [cityTyped, setCityTyped] = useState(false);
  const [pickingCity, setPickingCity] = useState<string | null>(null);
  const [cityError, setCityError] = useState<string | null>(null);

  const errors = validateTripForm(values);
  const visibleErrors = showErrors ? errors : {};
  const update = (field: 'title' | 'city' | 'endDate', value: string) =>
    setValues((current) => ({ ...current, [field]: value }));
  const city = linkedCity(values);
  const citySearch = usePlaceSearch(cityTyped && !city ? values.city : '', {
    kind: 'region',
    bias: null,
  });

  async function pickCity(suggestion: PlaceSuggestion) {
    setPickingCity(suggestion.placeId);
    setCityError(null);
    try {
      const { name, placeId, location } = await citySearch.pick(suggestion);
      setValues((current) => ({ ...current, city: name, cityPlace: { name, placeId, location } }));
    } catch (error) {
      console.error(error);
      setCityError('도시 정보를 불러오지 못했어요. 다시 시도해 주세요.');
    } finally {
      setPickingCity(null);
    }
  }

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
        <div className="flex flex-col gap-2">
          <TextField
            label="도시"
            name="city"
            placeholder="예: 오사카"
            autoComplete="off"
            enterKeyHint="next"
            value={values.city}
            onChange={(e) => {
              setCityTyped(true);
              update('city', e.target.value);
            }}
            error={visibleErrors.city}
            hint={
              citySearch.availability !== 'ready'
                ? undefined
                : city
                  ? '이 도시 근처의 장소가 먼저 검색돼요.'
                  : '검색해서 고르면 그 근처의 장소가 먼저 검색돼요.'
            }
          />
          {citySearch.availability === 'ready' && (
            <PlaceSuggestionList
              search={citySearch}
              picking={pickingCity}
              onPick={(suggestion) => void pickCity(suggestion)}
            />
          )}
          {cityError && (
            <p role="alert" className="text-sm text-red-500">
              {cityError}
            </p>
          )}
        </div>
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
