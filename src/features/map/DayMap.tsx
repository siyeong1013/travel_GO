import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { ScheduleItem } from '@/data/models';
import { type RouteStop, routeStops, unplacedNumbers } from '@/features/map/route';
import { createRouteMap, loadRouteMapLibraries, type RouteMap } from '@/features/map/routeMap';
import { type SearchAvailability, useSearchAvailability } from '@/features/places/usePlaceSearch';

const NOTES: Record<Exclude<SearchAvailability, 'ready'>, string> = {
  no_key: 'Google Maps API 키가 없어서 지도를 볼 수 없어요.',
  offline: '오프라인이라 지도를 볼 수 없어요.',
};

/**
 * The day's places on a Google map, numbered like the list and joined in order by straight lines
 * (the list has the directions for each leg). Nothing when no item has a location.
 */
export function DayMap({ items }: { items: ScheduleItem[] }) {
  const stops = routeStops(items);
  if (stops.length === 0) return null;
  return <DayMapCard stops={stops} unplaced={unplacedNumbers(items)} />;
}

function DayMapCard({ stops, unplaced }: { stops: RouteStop[]; unplaced: number[] }) {
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

  const draw = useEffectEvent((map: RouteMap) => map.show(stops));
  const stopsKey = JSON.stringify(stops);
  useEffect(() => {
    if (routeMap) draw(routeMap);
  }, [routeMap, stopsKey]);

  return (
    <div className="px-4 pt-4">
      {/* A map that has loaded stays when the connection drops (what it has drawn still shows). */}
      {routeMap === null && availability !== 'ready' ? (
        <p role="note" className="rounded-xl bg-gray-50 px-3 py-2.5 text-sm break-keep text-gray-600">
          {NOTES[availability]}
        </p>
      ) : (
        <>
          <div
            className={`relative h-48 overflow-hidden rounded-2xl bg-gray-100 ${loading ? 'animate-pulse motion-reduce:animate-none' : ''}`}
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
          {unplaced.length > 0 && (
            <p className="mt-1.5 text-xs break-keep text-gray-500">
              {unplaced.join(', ')}번은 위치가 없어서 지도에 없어요.
            </p>
          )}
        </>
      )}
    </div>
  );
}
