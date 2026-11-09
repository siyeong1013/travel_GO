import { ZoomableMap } from '@/features/countries/ZoomableMap';
import { WORLD_COUNTRIES, WORLD_HEIGHT, WORLD_WIDTH } from '@/features/countries/worldMap';

const SIZE = { width: WORLD_WIDTH, height: WORLD_HEIGHT };
/** How many times in the map zooms: Hong Kong and Singapore are about 10px there. */
const MAX_SCALE = 32;
/** The white line between countries, in the map's units at the whole view (wider zoomed in). */
const BORDER = 6;
/** px: a visited country smaller than this on screen is drawn at least this big, a speck. */
const SPECK = 3;
const SMALL = WORLD_COUNTRIES.filter((country) => country.length === 3);

interface WorldMapProps {
  visited: ReadonlySet<string>;
  /** What the map shows, for screen readers (the list below is what changes it). */
  label: string;
}

/**
 * The world with the visited countries filled in, zooming in and out. Drawn from the app's own
 * data (scripts/world-map.mjs): free, and there offline. Each country is its own shape, the small
 * ones too: one too small to see (Singapore, the whole world on a phone) is drawn with its outline
 * wide, a speck that becomes its shape as the map zooms in. It only shows: countries go on and off
 * by name, below (a tap on a phone scrolling by is no pick).
 */
export function WorldMap({ visited, label }: WorldMapProps) {
  return (
    <ZoomableMap
      size={SIZE}
      maxScale={MAX_SCALE}
      label={label}
      className="block h-auto w-full"
      buttons="left"
    >
      {({ scale, unit }) => (
        <>
          {WORLD_COUNTRIES.map(([code, path]) => (
            <path
              key={code}
              data-code={code}
              d={path}
              className={visited.has(code) ? 'fill-brand-500' : 'fill-gray-200'}
              stroke="white"
              strokeWidth={BORDER / Math.sqrt(scale)}
            />
          ))}
          {unit > 0 &&
            SMALL.map(([code, path, size]) => {
              // px to add around it on screen (half each side) to make it a speck.
              const grow = SPECK - size * unit * scale;
              return (
                visited.has(code) &&
                grow > 0 && (
                  <path
                    key={`${code} speck`}
                    d={path}
                    className="fill-brand-500 stroke-brand-500"
                    strokeWidth={grow / (unit * scale)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )
              );
            })}
        </>
      )}
    </ZoomableMap>
  );
}
