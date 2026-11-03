import { type FormEvent, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { TextField } from '@/components/ui/Field';
import type { GeoPoint, PlaceSnapshot } from '@/data/models';
import type { PlaceSuggestion } from '@/features/places/placeSearch';
import { PlaceSuggestionList } from '@/features/places/PlaceSuggestionList';
import { SearchUnavailableNote } from '@/features/places/SearchUnavailableNote';
import { usePlaceSearch } from '@/features/places/usePlaceSearch';

interface PlaceSearchSheetProps {
  /** Text searched right away, e.g. the item's current name. */
  initialText: string;
  bias: GeoPoint | null;
  onPick: (place: PlaceSnapshot) => void;
  onClose: () => void;
}

/** Finds a place for an existing item (to give it an address and location, or another place). */
export function PlaceSearchSheet({ initialText, bias, onPick, onClose }: PlaceSearchSheetProps) {
  const [text, setText] = useState(initialText);
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const search = usePlaceSearch(text, { kind: 'place', bias });

  async function pick(suggestion: PlaceSuggestion) {
    setPicking(suggestion.placeId);
    setError(null);
    try {
      onPick(await search.pick(suggestion));
      onClose();
    } catch (err) {
      console.error(err);
      setError('장소 정보를 불러오지 못했어요. 다시 시도해 주세요.');
      setPicking(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Enter only closes the keyboard; a place is picked by tapping it.
    (event.currentTarget.elements.namedItem('query') as HTMLElement | null)?.blur();
  }

  return (
    <BottomSheet open onClose={onClose} title="장소 찾기">
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 px-3 pb-2">
        <SearchUnavailableNote availability={search.availability} />
        <TextField
          label="장소 이름"
          name="query"
          placeholder="예: 오사카성"
          autoComplete="off"
          enterKeyHint="search"
          maxLength={100}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <PlaceSuggestionList search={search} picking={picking} onPick={(s) => void pick(s)} />
        {error && (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}
      </form>
    </BottomSheet>
  );
}
