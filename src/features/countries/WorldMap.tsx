import { WORLD_COUNTRIES, WORLD_HEIGHT, WORLD_WIDTH } from '@/features/countries/worldMap';

const DOTS = WORLD_COUNTRIES.filter((country) => country.length === 4);

interface WorldMapProps {
  visited: ReadonlySet<string>;
  /** What the map shows, for screen readers (the list below is what changes it). */
  label: string;
}

/**
 * The world with the visited countries filled in. Ones too small to see show as dots once
 * visited. Drawn from the app's own data (scripts/world-map.mjs): free, and there offline. It
 * only shows: countries go on and off by name, below (a tap on a phone scrolling by is no pick).
 */
export function WorldMap({ visited, label }: WorldMapProps) {
  return (
    <svg
      viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`}
      role="img"
      aria-label={label}
      className="block h-auto w-full"
    >
      {WORLD_COUNTRIES.map(([code, path]) => (
        <path
          key={code}
          data-code={code}
          d={path}
          className={visited.has(code) ? 'fill-brand-500' : 'fill-gray-200'}
          stroke="white"
          strokeWidth={0.6}
        />
      ))}
      {DOTS.filter(([code]) => visited.has(code)).map(([code, , x, y]) => (
        <circle
          key={code}
          data-code={code}
          cx={x}
          cy={y}
          r={6}
          className="fill-brand-500"
          stroke="white"
          strokeWidth={2}
        />
      ))}
    </svg>
  );
}
