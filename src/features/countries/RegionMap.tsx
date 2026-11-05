import type { RegionMapData } from '@/features/countries/regionMaps';

interface RegionMapProps {
  map: RegionMapData;
  visited: ReadonlySet<string>;
  /** A region tapped on the map. */
  onPick: (code: string) => void;
  /** What the map shows, for screen readers (they use the list instead of tapping). */
  label: string;
}

/**
 * A country's regions with the visited ones filled in; ones too small to see show as dots once
 * visited. Tall countries (Chile) fit the screen's height.
 */
export function RegionMap({ map, visited, onPick, label }: RegionMapProps) {
  return (
    <svg
      viewBox={`0 0 ${map.width} ${map.height}`}
      role="img"
      aria-label={label}
      className="mx-auto block h-auto max-h-[55dvh] w-full"
      onClick={(event) => {
        const code = (event.target as Element).closest('[data-code]')?.getAttribute('data-code');
        if (code) onPick(code);
      }}
    >
      {map.regions.map(
        ([code, , path]) =>
          path && (
            <path
              key={code}
              data-code={code}
              d={path}
              className={visited.has(code) ? 'fill-brand-500' : 'fill-gray-200'}
              stroke="white"
              strokeWidth={1.5}
            />
          ),
      )}
      {map.regions.map(
        (region) =>
          region.length === 5 &&
          visited.has(region[0]) && (
            <circle
              key={`${region[0]} dot`}
              data-code={region[0]}
              cx={region[3]}
              cy={region[4]}
              r={10}
              className="fill-brand-500"
              stroke="white"
              strokeWidth={3}
            />
          ),
      )}
    </svg>
  );
}
