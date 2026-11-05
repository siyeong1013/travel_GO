import { WORLD_COUNTRIES, WORLD_HEIGHT, WORLD_WIDTH } from '@/features/countries/worldMap';

const DOTS = WORLD_COUNTRIES.filter((country) => country.length === 4);

interface WorldMapProps {
  visited: ReadonlySet<string>;
  /** A country tapped on the map. */
  onPick: (code: string) => void;
  /** What the map shows, for screen readers (they use the list instead of tapping). */
  label: string;
}

/**
 * The world with the visited countries filled in. Ones too small to see show as dots once
 * visited. Drawn from the app's own data (scripts/world-map.mjs): free, and there offline.
 */
export function WorldMap({ visited, onPick, label }: WorldMapProps) {
  return (
    <svg
      viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`}
      role="img"
      aria-label={label}
      className="block h-auto w-full"
      onClick={(event) => {
        const code = (event.target as Element).closest('[data-code]')?.getAttribute('data-code');
        if (code) onPick(code);
      }}
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
