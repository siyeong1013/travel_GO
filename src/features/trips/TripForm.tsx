import { type FormEvent, useState } from 'react';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { DateRangeSheet } from '@/components/ui/DateRangeSheet';
import { ButtonField, TextField } from '@/components/ui/Field';
import type { ID } from '@/data/models';
import { awaitingLookup, type FlightDraft } from '@/features/schedule/flightDrafts';
import { useFlightLookups } from '@/features/schedule/useFlightLookups';
import { prepareCoverPhoto } from '@/features/trips/coverPhoto';
import { CoverPhotoField } from '@/features/trips/CoverPhotoField';
import { TripCitiesField } from '@/features/trips/TripCitiesField';
import { TripCountriesField } from '@/features/trips/TripCountriesField';
import { TripFlightsField } from '@/features/trips/TripFlightsField';
import {
  TITLE_MAX_LENGTH,
  TRIP_FORM_FIELDS,
  type TripFormValues,
  validateTripForm,
  withCity,
  withFlightCountries,
} from '@/features/trips/tripForm';
import { isLocalDate, toLocalDate } from '@/lib/dates';
import { errorMessage } from '@/lib/errorMessage';
import { formatDateRange, formatTripLength } from '@/lib/format';

interface TripFormProps {
  /** The trip's id, or the one the new trip will get: it picks the cover's color. */
  tripId: ID;
  initialValues: TripFormValues;
  submitLabel: string;
  /** A new trip: its flights can be typed in too. */
  withFlights?: boolean;
  /** Errors thrown here are shown above the submit button. */
  onSubmit: (values: TripFormValues) => Promise<void>;
}

export function TripForm({
  tripId,
  initialValues,
  submitLabel,
  withFlights = false,
  onSubmit,
}: TripFormProps) {
  const [values, setValues] = useState(initialValues);
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [preparingCover, setPreparingCover] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [pickingDates, setPickingDates] = useState(false);

  const errors = validateTripForm(values);
  const visibleErrors = showErrors ? errors : {};
  const today = toLocalDate();
  const datesPicked = isLocalDate(values.startDate) && isLocalDate(values.endDate);
  const setFlights = (change: (flights: FlightDraft[]) => FlightDraft[]) =>
    setValues((current) => ({ ...current, flights: change(current.flights) }));

  function pickDates(startDate: string, endDate: string) {
    setPickingDates(false);
    setValues((current) => ({
      ...current,
      startDate,
      endDate,
      // Flights without a day yet: the first leaves on the first day, the others on the last.
      flights: current.flights.map((flight, index) =>
        flight.date ? flight : { ...flight, date: index === 0 ? startDate : endDate },
      ),
    }));
  }

  // Each flight is looked up as it is typed; one found adds the countries it lands in.
  const lookUp = useFlightLookups(values.flights, setFlights, (key) =>
    setValues((current) => {
      const found = current.flights.find((row) => row.key === key);
      if (!found) return current;
      return { ...current, countries: withFlightCountries(current.countries, current.flights, found) };
    }),
  );
  const awaitingFlights = values.flights.some(awaitingLookup);

  async function pickCover(file: File) {
    setPreparingCover(true);
    setCoverError(null);
    try {
      const cover = await prepareCoverPhoto(file);
      setValues((current) => ({ ...current, cover }));
    } catch (error) {
      console.error(error);
      setCoverError('이 사진은 열 수 없어요. 다른 사진을 골라 주세요.');
    } finally {
      setPreparingCover(false);
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

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-6 px-4 py-6">
        <TextField
          label="여행 이름"
          name="title"
          placeholder="예: 오사카 먹방 여행"
          maxLength={TITLE_MAX_LENGTH}
          autoComplete="off"
          enterKeyHint="next"
          value={values.title}
          onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))}
          error={visibleErrors.title}
        />
        <TripCountriesField
          countries={values.countries}
          onChange={(countries) => setValues((current) => ({ ...current, countries }))}
        />
        <TripCitiesField
          cities={values.cities}
          text={values.cityText}
          countries={values.countries}
          error={visibleErrors.cities}
          onTextChange={(cityText) => setValues((current) => ({ ...current, cityText }))}
          onAdd={(city) => setValues((current) => ({ ...current, cities: withCity(current.cities, city) }))}
          onRemove={(index) =>
            setValues((current) => ({ ...current, cities: current.cities.filter((_, i) => i !== index) }))
          }
        />
        <ButtonField
          label="여행 기간"
          name="dates"
          value={
            datesPicked
              ? `${formatDateRange(values.startDate, values.endDate, today)} · ${formatTripLength(values.startDate, values.endDate)}`
              : null
          }
          placeholder="날짜를 골라 주세요"
          error={visibleErrors.dates}
          onClick={() => setPickingDates(true)}
        />
        {withFlights && (
          <TripFlightsField
            flights={values.flights}
            onAdd={() =>
              setValues((current) => ({
                ...current,
                flights: [
                  ...current.flights,
                  {
                    key: (current.flights.at(-1)?.key ?? 0) + 1,
                    number: '',
                    // Likely the way there, then the way back.
                    date: current.flights.length === 0 ? current.startDate : current.endDate,
                    lookup: null,
                    leg: 0,
                  },
                ],
              }))
            }
            onChange={(key, change) =>
              setFlights((flights) => flights.map((row) => (row.key === key ? { ...row, ...change } : row)))
            }
            onRemove={(key) => setFlights((flights) => flights.filter((row) => row.key !== key))}
            onChoose={(key, leg) =>
              setFlights((flights) => flights.map((row) => (row.key === key ? { ...row, leg } : row)))
            }
            onLookUp={lookUp}
          />
        )}
        <CoverPhotoField
          cover={values.cover}
          tripId={tripId}
          preparing={preparingCover}
          error={coverError}
          onPick={(file) => void pickCover(file)}
          onRemove={() => setValues((current) => ({ ...current, cover: null }))}
        />
      </div>

      <BottomActionBar>
        {submitError && (
          <p role="alert" className="mb-2 text-center text-sm text-red-500">
            {submitError}
          </p>
        )}
        {/* A photo still being made smaller would be left out; a flight still being looked up would
            go in by its number only. */}
        <Button type="submit" block disabled={submitting || preparingCover || awaitingFlights}>
          {submitLabel}
        </Button>
      </BottomActionBar>

      <DateRangeSheet
        open={pickingDates}
        title="여행 기간"
        start={datesPicked ? values.startDate : null}
        end={datesPicked ? values.endDate : null}
        today={today}
        onClose={() => setPickingDates(false)}
        onDone={pickDates}
      />
    </form>
  );
}
