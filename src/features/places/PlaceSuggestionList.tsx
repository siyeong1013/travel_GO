import type { ReactNode } from 'react';
import { MapPinIcon } from '@/components/ui/icons';
import { GoogleMapsAttribution } from '@/features/places/GoogleMapsAttribution';
import type { PlaceSuggestion } from '@/features/places/placeSearch';
import type { PlaceSearchState, SearchStatus } from '@/features/places/usePlaceSearch';

interface PlaceSuggestionListProps {
  search: PlaceSearchState;
  /** Suggestion being fetched: its row shows progress. */
  picking: string | null;
  /** While saving: rows can't be tapped. */
  disabled?: boolean;
  onPick: (suggestion: PlaceSuggestion) => void;
  /** Row under the suggestions, e.g. "add as typed". */
  children?: ReactNode;
}

/** Suggestions as they arrive with Google's credit, and the search status (also read aloud). */
export function PlaceSuggestionList({
  search,
  picking,
  disabled = false,
  onPick,
  children,
}: PlaceSuggestionListProps) {
  const { status, suggestions } = search;
  const message = picking ? '장소 정보를 불러오는 중…' : statusMessage(status, suggestions.length);
  // With results on screen the status is for screen readers only (out of the layout, no gap).
  const shown = message !== '' && suggestions.length === 0;

  return (
    <div className="flex flex-col gap-2">
      <div className={shown ? 'flex items-center justify-between gap-2 px-1' : 'sr-only'}>
        <p role="status" className="text-sm text-gray-500">
          {message}
        </p>
        {status === 'failed' && (
          <button
            type="button"
            onClick={search.retry}
            className="flex min-h-11 shrink-0 items-center text-sm font-semibold text-brand-600"
          >
            다시 시도
          </button>
        )}
      </div>
      {suggestions.length > 0 && (
        <div className="rounded-2xl border border-gray-100">
          <ul aria-label="검색 결과" aria-busy={status === 'searching'}>
            {suggestions.map((suggestion) => (
              <li key={suggestion.placeId}>
                <button
                  type="button"
                  disabled={disabled || picking !== null}
                  onClick={() => onPick(suggestion)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left active:bg-gray-50 disabled:text-gray-400"
                >
                  <MapPinIcon width={20} height={20} className="shrink-0 text-gray-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{suggestion.name}</span>
                    {suggestion.detail && (
                      <span className="block truncate text-sm text-gray-500">{suggestion.detail}</span>
                    )}
                  </span>
                  {picking === suggestion.placeId && <Spinner />}
                </button>
              </li>
            ))}
          </ul>
          <GoogleMapsAttribution className="px-3 pb-2 text-right" />
        </div>
      )}
      {children}
    </div>
  );
}

function statusMessage(status: SearchStatus, count: number): string {
  switch (status) {
    case 'searching':
      return count > 0 ? '' : '검색 중…';
    case 'done':
      return count > 0 ? `검색 결과 ${count}개` : '검색 결과가 없어요.';
    case 'failed':
      return '장소를 검색하지 못했어요.';
    case 'idle':
      return '';
  }
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-4 shrink-0 animate-spin rounded-full border-2 border-gray-200 border-t-brand-500 motion-reduce:animate-none"
    />
  );
}
