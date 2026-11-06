import { codeOfCity, type RegionMapData } from '@/features/countries/regionMaps';

interface CityMapProps {
  map: RegionMapData;
  visited: ReadonlySet<string>;
  /** A city tapped on the map (its code). */
  onPick: (code: string) => void;
  /** What the map shows, for screen readers (they use the list instead of tapping). */
  label: string;
}

/**
 * A country's cities on its regions: each city's built-up area, filled in once visited; a visited
 * city without one to draw (a sight, a small town) is a dot. Tall countries (Chile) fit the
 * screen's height.
 */
export function CityMap({ map, visited, onPick, label }: CityMapProps) {
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
          path && <path key={code} d={path} className="fill-gray-200" stroke="white" strokeWidth={1.5} />,
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
              r={10}
              className="fill-brand-500"
              stroke="white"
              strokeWidth={3}
            />
          )
        );
      })}
    </svg>
  );
}
