import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { PageSection } from '@/components/ui/PageSection';
import { Snackbar } from '@/components/ui/Snackbar';
import { CityMap } from '@/features/countries/CityMap';
import { countryName, flagOf } from '@/features/countries/countryNames';
import { useCountryStore } from '@/features/countries/countryStore';
import {
  codeOfCity,
  findCities,
  loadRegionMap,
  namesOf,
  type RegionMapData,
} from '@/features/countries/regionMaps';
import { errorMessage } from '@/lib/errorMessage';
import { josa } from '@/lib/format';

interface Notice {
  id: number;
  message: string;
  undo?: () => void;
}

/**
 * The cities in `country` the person has been to: on its map, each city's built-up area a tap fills
 * in or clears (with an undo), and by name below, each with its region (a city's other name finds
 * it too: 냐짱 finds 나트랑; a region's name finds its cities). A city visited puts the country on
 * the world map too. `query`: what the search starts with (the city the countries' search found).
 */
export function CountryCities({ country, query: initialQuery = '' }: { country: string; query?: string }) {
  const countries = useCountryStore((state) => state.countries);
  const status = useCountryStore((state) => state.status);
  const load = useCountryStore((state) => state.load);
  const setVisited = useCountryStore((state) => state.setVisited);
  const [query, setQuery] = useState(initialQuery);
  const [notice, setNotice] = useState<Notice | null>(null);
  const notices = useRef(0);

  useEffect(() => {
    void load();
  }, [load]);

  // The map file, per country and try (`map` null: it didn't come).
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ country: string; attempt: number; map: RegionMapData | null }>();
  useEffect(() => {
    let current = true;
    loadRegionMap(country).then(
      (map) => {
        if (current) setResult({ country, attempt, map });
      },
      (error: unknown) => {
        console.error(error);
        if (current) setResult({ country, attempt, map: null });
      },
    );
    return () => {
      current = false;
    };
  }, [country, attempt]);
  const shown = result?.country === country && result.attempt === attempt ? result : undefined;
  const map = shown?.map ?? null;

  const visited = useMemo(() => new Set(countries.map((mark) => mark.id)), [countries]);
  const regionNames = useMemo(
    () => new Map<string, string>((map?.regions ?? []).map(([code, name]) => [code, name])),
    [map],
  );
  const cities = map?.cities ?? [];
  const here = cities.filter((city) => visited.has(codeOfCity(city)));
  const away = (map?.regions ?? []).filter(([, , path]) => !path).map(([, name]) => name);
  const found = findCities(cities, regionNames, query);

  async function change(code: string, name: string, next: boolean, undoable: boolean) {
    try {
      await setVisited(code, next);
      // A city of a country is in the country.
      if (next && !visited.has(country)) await setVisited(country, true);
      if (!undoable) return;
      setNotice({
        id: ++notices.current,
        message: next
          ? `${josa(name, '을/를')} 다녀온 도시에 넣었어요.`
          : `${josa(name, '을/를')} 다녀온 도시에서 뺐어요.`,
        undo: () => {
          setNotice(null);
          void change(code, name, !next, false);
        },
      });
    } catch (error) {
      console.error(error);
      setNotice({ id: ++notices.current, message: errorMessage(error) });
    }
  }

  const nameOf = (code: string) => cities.find((city) => codeOfCity(city) === code)?.[0] ?? code;

  return (
    <>
      <div className="px-4 pt-5">
        <p className="text-sm font-semibold text-gray-500">
          <span aria-hidden="true">{flagOf(country)} </span>
          {countryName(country)}에서 다녀온 도시
        </p>
        <p className="mt-0.5 text-3xl font-bold">{map && status === 'ready' ? `${here.length}곳` : ' '}</p>
      </div>
      <div className="mx-4 mt-4 rounded-2xl bg-gray-50 p-3">
        {map ? (
          <CityMap
            map={map}
            visited={visited}
            label={[`${countryName(country)} 지도`, ...here.map(([name]) => name)].join(', ')}
            onPick={(code) => void change(code, nameOf(code), !visited.has(code), true)}
          />
        ) : shown ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm break-keep text-gray-500">
              {navigator.onLine === false
                ? '인터넷에 연결되면 지도를 불러올 수 있어요.'
                : '지도를 불러오지 못했어요.'}
            </p>
            <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              다시 시도
            </Button>
          </div>
        ) : (
          <div className="h-48 animate-pulse rounded-xl bg-gray-100" />
        )}
      </div>
      {map && (
        <p className="px-4 pt-2 text-xs break-keep text-gray-400">
          지도에서 도시를 누르면 넣거나 빼요. 작은 도시는 아래에서 이름으로 찾아요.
          {away.length > 0 && ` 지도에 없는 ${away.join(', ')}의 도시도 아래에 있어요.`}
        </p>
      )}

      {map && (
        <PageSection title={`도시 ${cities.length}곳`}>
          <TextField
            label="도시나 지역 이름"
            type="search"
            placeholder={cities[0] ? `예: ${cities[0][0]}` : undefined}
            autoComplete="off"
            enterKeyHint="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <ul aria-label="도시" className="mt-2 divide-y divide-gray-100">
            {found.map((city) => {
              const code = codeOfCity(city);
              const [name, where] = city;
              const details = [regionNames.get(where), ...namesOf(city).slice(1)].filter(Boolean).join(' · ');
              return (
                <li key={code}>
                  <label className="flex min-h-12 items-center gap-3 px-1 py-1.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base">{name}</span>
                      {details && (
                        <>
                          {' '}
                          <span className="block truncate text-sm text-gray-500">{details}</span>
                        </>
                      )}
                    </span>
                    <input
                      type="checkbox"
                      checked={visited.has(code)}
                      onChange={(event) => void change(code, name, event.target.checked, false)}
                      className="size-5 accent-brand-600"
                    />
                  </label>
                </li>
              );
            })}
            {found.length === 0 && <li className="py-3 text-sm text-gray-500">찾는 도시가 없어요.</li>}
          </ul>
        </PageSection>
      )}

      {notice && (
        <Snackbar
          key={notice.id}
          message={notice.message}
          actionLabel={notice.undo ? '되돌리기' : undefined}
          onAction={notice.undo}
          onClose={() => setNotice(null)}
        />
      )}
    </>
  );
}
