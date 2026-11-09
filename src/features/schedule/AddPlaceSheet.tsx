import { type FormEvent, useEffect, useRef, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { SelectField, TextField } from '@/components/ui/Field';
import { PencilIcon, PlaneIcon } from '@/components/ui/icons';
import type { GeoPoint, ID, LocalDate, PlaceSnapshot } from '@/data/models';
import type { PlaceSuggestion } from '@/features/places/placeSearch';
import { PlaceSuggestionList } from '@/features/places/PlaceSuggestionList';
import { SearchUnavailableNote } from '@/features/places/SearchUnavailableNote';
import { usePlaceSearch } from '@/features/places/usePlaceSearch';
import { type DayTab, dateOf, type GroupKey, tabLabel } from '@/features/schedule/dayTabs';
import { useScheduleStore } from '@/features/schedule/scheduleStore';
import { errorMessage } from '@/lib/errorMessage';
import { parseFlightNumber } from '@/lib/flights';

interface AddPlaceSheetProps {
  tripId: ID;
  /** Days and the inbox, for the day select. */
  tabs: DayTab[];
  /** The day (or inbox) chosen to begin with: the one being looked at. */
  day: GroupKey;
  /** Where search looks first (`searchBias`). */
  bias: GeoPoint | null;
  /** Opens the flight sheet for a flight number typed here, and the day chosen. */
  onFlight?: (number: string, date: LocalDate | null) => void;
  /** After the place went in at the end of its day (or the inbox); the sheet closes. */
  onAdded?: (date: LocalDate | null) => void;
  onClose: () => void;
}

/** `saving` while the place is added by its name only. */
const BY_NAME = 'by-name';

/**
 * Adds a place, at the end of the day chosen (or the inbox): found by search (saved with its
 * address and location), or by its name alone: typed as is, or whenever search is unavailable (no
 * API key, offline). Flights have a sheet of their own: a flight number typed here (`KE723`)
 * points to it, and isn't searched for.
 */
export function AddPlaceSheet({
  tripId,
  tabs,
  day,
  bias,
  onFlight,
  onAdded,
  onClose,
}: AddPlaceSheetProps) {
  const add = useScheduleStore((state) => state.add);
  const formRef = useRef<HTMLFormElement>(null);
  const [groupKey, setGroupKey] = useState(day);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  /** The suggestion's placeId, or `BY_NAME`. */
  const [saving, setSaving] = useState<string | null>(null);
  const typed = name.trim();
  const flightNumber = onFlight ? parseFlightNumber(typed) : null;
  // A flight number isn't a place to search for (each search is billed).
  const search = usePlaceSearch(flightNumber ? '' : name, { kind: 'place', bias });
  const searchable = search.availability === 'ready';
  const date = dateOf(groupKey);

  // The name is typed first; on its own the sheet would focus its first control, the day.
  useEffect(() => {
    (formRef.current?.elements.namedItem('name') as HTMLElement | null)?.focus();
  }, []);

  async function save(key: string, getPlace: () => Promise<PlaceSnapshot>) {
    setSaving(key);
    setError(null);
    let place: PlaceSnapshot;
    try {
      place = await getPlace();
    } catch (err) {
      console.error(err);
      setError('장소 정보를 불러오지 못했어요. 다시 시도해 주세요.');
      setSaving(null);
      return;
    }
    try {
      await add({ tripId, date, place });
      onAdded?.(date);
      onClose();
    } catch (err) {
      console.error(err);
      setError(errorMessage(err));
      setSaving(null);
    }
  }

  function addPicked(suggestion: PlaceSuggestion) {
    void save(suggestion.placeId, () => search.pick(suggestion));
  }

  function addByName() {
    if (!typed) {
      setNameError('장소 이름을 입력해 주세요.');
      return;
    }
    void save(BY_NAME, async () => ({
      placeId: null,
      name: typed,
      address: null,
      location: null,
      fetchedAt: null,
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // With search, Enter only closes the keyboard: a suggestion (or "add as typed") is tapped.
    if (searchable) (event.currentTarget.elements.namedItem('name') as HTMLElement | null)?.blur();
    else addByName();
  }

  return (
    <BottomSheet open onClose={onClose} title="장소 추가">
      <form
        ref={formRef}
        noValidate
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 px-3 pb-2"
      >
        <SelectField
          label="날짜"
          name="day"
          value={groupKey}
          disabled={saving !== null}
          onChange={(e) => setGroupKey(e.target.value)}
        >
          {tabs.map((tab) => (
            <option key={tab.key} value={tab.key}>
              {tabLabel(tab)}
            </option>
          ))}
        </SelectField>
        <SearchUnavailableNote availability={search.availability} />
        <TextField
          label="장소 이름"
          name="name"
          placeholder="예: 오사카성"
          autoComplete="off"
          enterKeyHint={searchable ? 'search' : 'done'}
          maxLength={100}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameError(undefined);
          }}
          error={nameError}
          hint={searchable && !typed ? '검색해서 고르면 주소와 위치도 함께 저장돼요.' : undefined}
        />
        {flightNumber && onFlight && (
          <button
            type="button"
            disabled={saving !== null}
            onClick={() => onFlight(flightNumber, date)}
            className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left active:bg-gray-50 disabled:text-gray-400"
          >
            <PlaneIcon width={20} height={20} className="shrink-0 text-brand-600" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">항공편 추가에서 {flightNumber} 찾기</span>
              <span className="block text-sm break-keep text-gray-500">
                출발 시간과 공항, 편 정보를 함께 넣어요
              </span>
            </span>
          </button>
        )}
        {searchable ? (
          <PlaceSuggestionList
            search={search}
            picking={saving === BY_NAME ? null : saving}
            disabled={saving !== null}
            onPick={addPicked}
          >
            {typed && (
              <button
                type="button"
                disabled={saving !== null}
                onClick={addByName}
                className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left active:bg-gray-50 disabled:text-gray-400"
              >
                <PencilIcon width={20} height={20} className="shrink-0 text-gray-400" />
                <span className="min-w-0 flex-1">
                  <span className="flex font-semibold">
                    <span className="truncate">'{typed}'</span>
                    <span className="shrink-0 whitespace-pre"> 그대로 추가</span>
                  </span>
                  <span className="block text-sm text-gray-500">주소·위치 없이 이름만 저장돼요</span>
                </span>
              </button>
            )}
          </PlaceSuggestionList>
        ) : (
          <Button type="submit" block disabled={saving !== null}>
            추가
          </Button>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}
      </form>
    </BottomSheet>
  );
}
