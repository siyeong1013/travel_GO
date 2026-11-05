import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { CloseIcon } from '@/components/ui/icons';
import type { TripCity } from '@/data/models';
import { MAX_TRIP_CITIES } from '@/data/rules/validation';
import type { PlaceSuggestion } from '@/features/places/placeSearch';
import { PlaceSuggestionList } from '@/features/places/PlaceSuggestionList';
import { usePlaceSearch } from '@/features/places/usePlaceSearch';
import { typedCity } from '@/features/trips/tripForm';

interface TripCitiesFieldProps {
  cities: TripCity[];
  /** The search box: a city still to add. */
  text: string;
  /** Search stays within these (none: anywhere). */
  countries: string[];
  error?: string;
  onTextChange: (text: string) => void;
  onAdd: (city: TripCity) => void;
  onRemove: (index: number) => void;
}

/**
 * The cities a trip goes to: found by search (Google's city, which place search then looks around)
 * or as typed; one after another.
 */
export function TripCitiesField({
  cities,
  text,
  countries,
  error,
  onTextChange,
  onAdd,
  onRemove,
}: TripCitiesFieldProps) {
  const [picking, setPicking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const search = usePlaceSearch(text, { kind: 'region', bias: null, countries });
  const typed = text.trim();

  function add(city: TripCity) {
    if (cities.length >= MAX_TRIP_CITIES) {
      setMessage(`도시는 ${MAX_TRIP_CITIES}개까지 넣을 수 있어요.`);
      return;
    }
    onAdd(city);
    onTextChange('');
    setMessage(null);
  }

  async function pick(suggestion: PlaceSuggestion) {
    setPicking(suggestion.placeId);
    setMessage(null);
    try {
      const { name, placeId, location, fetchedAt } = await search.pick(suggestion);
      add({ name, placeId, location, fetchedAt });
    } catch (failure) {
      console.error(failure);
      setMessage('도시 정보를 불러오지 못했어요. 다시 시도해 주세요.');
    } finally {
      setPicking(null);
    }
  }

  const addTyped = (
    <button
      type="button"
      onClick={() => add(typedCity(typed))}
      className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left active:bg-gray-50"
    >
      <span className="min-w-0 flex-1">
        <span className="flex font-semibold">
          <span className="truncate">'{typed}'</span>
          <span className="shrink-0 whitespace-pre"> 그대로 넣기</span>
        </span>
        <span className="block text-sm text-gray-500">위치 없이 이름만 넣어요</span>
      </span>
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      <TextField
        label="도시"
        name="cities"
        placeholder={cities.length > 0 ? '도시 더 넣기' : '예: 오사카'}
        autoComplete="off"
        enterKeyHint="done"
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
          // Not the form: a city picked from search beats one typed.
          event.preventDefault();
          if (search.availability !== 'ready' && typed) add(typedCity(typed));
          else event.currentTarget.blur();
        }}
        error={error}
        hint={
          search.availability === 'ready'
            ? countries.length > 0
              ? '고른 나라에서 찾아요. 고른 도시 근처의 장소가 먼저 검색돼요.'
              : '검색해서 고르면 그 근처의 장소가 먼저 검색돼요.'
            : undefined
        }
      />
      {typed &&
        (search.availability === 'ready' ? (
          <PlaceSuggestionList search={search} picking={picking} onPick={(found) => void pick(found)}>
            {addTyped}
          </PlaceSuggestionList>
        ) : (
          <Button variant="secondary" onClick={() => add(typedCity(typed))}>
            '{typed}' 넣기
          </Button>
        ))}
      {message && (
        <p role="alert" className="text-sm text-red-500">
          {message}
        </p>
      )}
      {cities.length > 0 && (
        <ul aria-label="넣은 도시" className="flex flex-wrap gap-2">
          {cities.map((city, index) => (
            <li
              key={`${city.placeId ?? 'typed'} ${city.name}`}
              className="flex h-11 items-center rounded-full bg-gray-100 pl-3.5 text-[15px]"
            >
              {city.name}
              <button
                type="button"
                aria-label={`${city.name} 빼기`}
                onClick={() => onRemove(index)}
                className="flex size-11 items-center justify-center rounded-full text-gray-500 active:bg-gray-200"
              >
                <CloseIcon width={16} height={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
