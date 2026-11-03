import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { ScheduleItem } from '@/data/models';
import {
  directionsUrl,
  type RouteLeg,
  type RouteStop,
  routeLegs,
  routeStops,
  unplacedNumbers,
} from '@/features/map/route';
import { createRouteMap, loadRouteMapLibraries, type RouteMap } from '@/features/map/routeMap';
import { type SearchAvailability, useSearchAvailability } from '@/features/places/usePlaceSearch';

const NOTES: Record<Exclude<SearchAvailability, 'ready'>, string> = {
  no_key: 'Google Maps API 키가 없어서 지도를 볼 수 없어요.',
  offline: '오프라인이라 지도를 볼 수 없어요.',
};

/**
 * The day's places on a Google map, numbered like the list and joined in order by straight lines,
 * with directions in Google Maps for each leg. Nothing when no item has a location.
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

  const legs = routeLegs(stops);
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
      {legs.length > 0 && <LegLinks legs={legs} />}
    </div>
  );
}

/** One link per leg, in a row that scrolls sideways. */
function LegLinks({ legs }: { legs: RouteLeg[] }) {
  return (
    <nav
      aria-label="구간별 길찾기"
      className="-mx-4 mt-1 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {legs.map((leg) => (
        <a
          key={`${leg.from.id}-${leg.to.id}`}
          href={directionsUrl(leg)}
          target="_blank"
          rel="noreferrer"
          aria-label={`${leg.from.number}번 ${leg.from.name}에서 ${leg.to.number}번 ${leg.to.name}까지 길찾기`}
          className="group flex h-11 shrink-0 items-center outline-none"
        >
          <span className="flex h-9 items-center gap-1 rounded-full border border-gray-200 bg-white pr-3 pl-1.5 text-sm font-semibold text-gray-700 group-focus-visible:ring-2 group-focus-visible:ring-brand-100 group-active:bg-gray-50">
            <LegNumber number={leg.from.number} />
            <span className="text-gray-400">→</span>
            <LegNumber number={leg.to.number} />
            <span className="ml-0.5">길찾기</span>
          </span>
        </a>
      ))}
    </nav>
  );
}

function LegNumber({ number }: { number: number }) {
  return (
    <span className="flex size-6 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
      {number}
    </span>
  );
}
