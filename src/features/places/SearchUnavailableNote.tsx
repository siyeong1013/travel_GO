import type { SearchAvailability } from '@/features/places/usePlaceSearch';

const NOTES: Record<Exclude<SearchAvailability, 'ready'>, string> = {
  no_key: 'Google Maps API 키가 없어서 장소를 검색할 수 없어요. 이름만 저장돼요.',
  offline: '오프라인이라 장소를 검색할 수 없어요. 이름만 저장돼요.',
};

/** Why there is no search, where a place would otherwise be searched. Nothing when it is ready. */
export function SearchUnavailableNote({ availability }: { availability: SearchAvailability }) {
  if (availability === 'ready') return null;
  return (
    <p role="note" className="rounded-xl bg-gray-50 px-3 py-2.5 text-sm break-keep text-gray-600">
      {NOTES[availability]}
    </p>
  );
}
