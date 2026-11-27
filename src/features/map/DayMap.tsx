import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { GeoPoint, ID, ScheduleItem } from '@/data/models';
import {
  inboxPins,
  type MapPin,
  routeStops,
  unplacedCount,
  unplacedNumbers,
} from '@/features/map/route';
import { createRouteMap, loadRouteMapLibraries, type RouteMap } from '@/features/map/routeMap';
import { type SearchAvailability, useSearchAvailability } from '@/features/places/usePlaceSearch';

const NOTES: Record<Exclude<SearchAvailability, 'ready'>, string> = {
  no_key: 'Google Maps API 키가 없어서 지도를 볼 수 없어요.',
  offline: '오프라인이라 지도를 볼 수 없어요.',
};

interface DayMapProps {
  items: ScheduleItem[];
  /** A day's, numbered and joined in order; or the inbox's, in no order. */
  ordered: boolean;
  /** Where the trip is that day (`daySpots`): shown when no item of the day is on the map. */
  area: GeoPoint | null;
  focusedId: ID | null;
}

/**
 * The day's places on a Google map, numbered like the list and joined in order by straight lines
 * (the list has the directions for each leg), with the one in `focusedId` up close (`useMapFocus`).
 * The inbox's are plain pins, to see where they are before picking their days. Nothing when no
 * item has a location: then a day shows around where the trip is (`area`, as for its weather),
 * so the map is there before the first place; the inbox shows nothing.
 */
export function DayMap({ items, ordered, focusedId, area }: DayMapProps) {
  const pins = ordered ? routeStops(items) : inboxPins(items);
  const around = pins.length === 0 && ordered ? area : null;
  if (pins.length === 0 && !around) return null;
  const note = around
    ? items.length === 0
      ? '장소를 넣으면 이 지도에 번호로 보여요.'
      : '위치가 있는 장소를 넣으면 이 지도에 번호로 보여요.'
    : unplacedNote(items, ordered);
  return <DayMapCard pins={pins} area={around} note={note} focusedId={focusedId} />;
}

/** Why some places are not on the map: `2, 4번은 …`, or how many in the inbox. */
function unplacedNote(items: ScheduleItem[], ordered: boolean): string | null {
  if (ordered) {
    const numbers = unplacedNumbers(items);
    return numbers.length > 0 ? `${numbers.join(', ')}번은 위치가 없어서 지도에 없어요.` : null;
  }
  const count = unplacedCount(items);
  return count > 0 ? `위치가 없는 ${count}곳은 지도에 없어요.` : null;
}

interface DayMapCardProps {
  pins: MapPin[];
  /** Shown, without pins, when there are none. */
  area: GeoPoint | null;
  note: string | null;
  focusedId: ID | null;
}

function DayMapCard({ pins, area, note, focusedId }: DayMapCardProps) {
  const availability = useSearchAvailability();
  const container = useRef<HTMLDivElement>(null);
  const [routeMap, setRouteMap] = useState<RouteMap | null>(null);
  const [failed, setFailed] = useState(false);
  const loading = routeMap === null && availability === 'ready' && !failed;

  useEffect(() => {
    if (!loading) return;
    let cancelled = false;
    loadRouteMapLibraries()
      .then((libraries) => {
        if (!cancelled && container.current) {
          setRouteMap(createRouteMap(container.current, libraries));
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error(error);
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loading]);

  useEffect(() => () => routeMap?.destroy(), [routeMap]);

  const draw = useEffectEvent((map: RouteMap) => {
    if (pins.length === 0 && area) map.showArea(area);
    else map.show(pins);
  });
  const stopsKey = JSON.stringify([pins, area]);
  useEffect(() => {
    if (routeMap) draw(routeMap);
  }, [routeMap, stopsKey]);

  // After drawing: the stop up close is among those drawn.
  useEffect(() => {
    routeMap?.focus(focusedId);
  }, [routeMap, focusedId, stopsKey]);

  // Only an area to show: nothing rather than a note on a day that has no places anyway.
  if (pins.length === 0 && routeMap === null && availability !== 'ready') return null;

  return (
    <div className="px-4 pt-3 pb-3">
      {/* A map that has loaded stays when the connection drops (what it has drawn still shows). */}
      {routeMap === null && availability !== 'ready' ? (
        <p role="note" className="rounded-xl bg-gray-50 px-3 py-2.5 text-sm break-keep text-gray-600">
          {NOTES[availability]}
        </p>
      ) : (
        <>
          <div
            // Taller on taller screens; it stays on screen while the list scrolls under it.
            className={`relative h-[clamp(12rem,30svh,16rem)] overflow-hidden rounded-2xl bg-gray-100 ${loading ? 'animate-pulse motion-reduce:animate-none' : ''}`}
          >
            <div ref={container} className="absolute inset-0" />
            {loading && (
              <p role="status" className="sr-only">
                지도를 불러오는 중이에요.
              </p>
            )}
            {failed && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-sm text-gray-600">
                <p>지도를 불러오지 못했어요.</p>
                <button
                  type="button"
                  onClick={() => setFailed(false)}
                  className="h-11 rounded-xl px-4 font-semibold text-brand-600 active:bg-gray-200"
                >
                  다시 시도
                </button>
              </div>
            )}
          </div>
          {note && <p className="mt-1.5 text-xs break-keep text-gray-500">{note}</p>}
        </>
      )}
    </div>
  );
}
