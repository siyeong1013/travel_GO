import { codeOfCity, type RegionMapData } from '@/features/countries/regionMaps';
import { ZoomableMap } from '@/features/countries/ZoomableMap';

/** How many times in the map zooms: its outlines are whole units, which show as steps past this. */
const MAX_SCALE = 8;

interface CityMapProps {
  map: RegionMapData;
  visited: ReadonlySet<string>;
  /** What the map shows, for screen readers (the list below is what changes it). */
  label: string;
}

/**
 * A country's cities on its regions: each city's built-up area, filled in once visited; a visited
 * city without one to draw (a sight, a small town) is a dot, the same size however far in the map
 * zooms. Tall countries (Chile) fit the screen's height. It only shows: cities go on and off by
 * name, below.
 */
export function CityMap({ map, visited, label }: CityMapProps) {
  return (
    <ZoomableMap
      size={map}
      maxScale={MAX_SCALE}
      label={label}
      className="mx-auto block h-auto max-h-[55dvh] w-full"
      buttons="right"
    >
      {({ scale }) => (
        <>
          {map.regions.map(
            ([code, , path]) =>
              path && (
                <path
                  key={code}
                  d={path}
                  className="fill-gray-200"
                  stroke="white"
                  strokeWidth={1.5 / Math.sqrt(scale)}
                />
              ),
          )}
          {map.cities.map((city) => {
            const code = codeOfCity(city);
            return (
              city[4] && (
                <path
                  key={code}
                  data-code={code}
                  d={city[4]}
                  fillRule="evenodd"
                  className={visited.has(code) ? 'fill-brand-500' : 'fill-gray-400'}
                />
              )
            );
          })}
          {map.cities.map((city) => {
            const code = codeOfCity(city);
            const [, , x, y, area] = city;
            return (
              !area &&
              x !== null &&
              y !== null &&
              visited.has(code) && (
                <circle
                  key={`${code} dot`}
                  data-code={code}
                  cx={x}
                  cy={y}
                  r={10 / scale}
                  className="fill-brand-500"
                  stroke="white"
                  strokeWidth={3 / scale}
                />
              )
            );
          })}
        </>
      )}
    </ZoomableMap>
  );
}
