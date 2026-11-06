import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { TextField } from '@/components/ui/Field';
import { ChevronRightIcon } from '@/components/ui/icons';
import { PageSection } from '@/components/ui/PageSection';
import { Snackbar } from '@/components/ui/Snackbar';
import { isCityCode, isCountryCode } from '@/data/rules/country';
import { byName, countryName, flagOf, searchCountries } from '@/features/countries/countryNames';
import { useCountryStore } from '@/features/countries/countryStore';
import { regionCount } from '@/features/countries/regionMaps';
import { usePlaces } from '@/features/countries/usePlaces';
import { WorldMap } from '@/features/countries/WorldMap';
import { errorMessage } from '@/lib/errorMessage';
import { josa } from '@/lib/format';

interface Notice {
  id: number;
  message: string;
  undo?: () => void;
}

/**
 * "다녀온 나라": a world map with the countries the person has been to, which a tap puts on it
 * or takes off (with an undo), and a search for the rest, small ones included: by name, or by a
 * city in one (파리 finds 프랑스, and its cities open on 파리).
 */
export function VisitedCountries() {
  const countries = useCountryStore((state) => state.countries);
  const status = useCountryStore((state) => state.status);
  const load = useCountryStore((state) => state.load);
  const setVisited = useCountryStore((state) => state.setVisited);
  const places = usePlaces();
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const notices = useRef(0);

  useEffect(() => {
    void load();
  }, [load]);

  // Countries only: the regions in them are on their own pages.
  const visited = useMemo(
    () => new Set(countries.flatMap((mark) => (isCountryCode(mark.id) ? [mark.id] : []))),
    [countries],
  );
  const citiesVisited = (code: string) =>
    countries.filter((mark) => isCityCode(mark.id) && mark.id.startsWith(code)).length;
  const visitedNames = byName([...visited]);
  const found = searchCountries(query, places);

  async function change(code: string, next: boolean, undoable: boolean) {
    try {
      await setVisited(code, next);
      if (!undoable) return;
      const name = josa(countryName(code), '을/를');
      setNotice({
        id: ++notices.current,
        message: next ? `${name} 다녀온 나라에 넣었어요.` : `${name} 다녀온 나라에서 뺐어요.`,
        undo: () => {
          setNotice(null);
          void change(code, !next, false);
        },
      });
    } catch (error) {
      console.error(error);
      setNotice({ id: ++notices.current, message: errorMessage(error) });
    }
  }

  // `matched`: places in it the search found, shown under its name.
  const row = (code: string, matched: string[] = []) => (
    <li key={code} className="flex min-h-12 items-center gap-1 px-1">
      <label htmlFor={`country-${code}`} className="flex min-w-0 flex-1 items-center gap-3 py-3">
        <span aria-hidden="true" className="text-xl">
          {flagOf(code)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base">{countryName(code)}</span>
          {matched.length > 0 && (
            <>
              {' '}
              <span className="block truncate text-sm text-gray-500">{matched.join(', ')}</span>
            </>
          )}
        </span>
      </label>
      {regionCount(code) > 0 && (
        <Link
          to={matched[0] ? `/countries/${code}?q=${encodeURIComponent(matched[0])}` : `/countries/${code}`}
          aria-label={`${countryName(code)} 도시`}
          className="flex h-11 shrink-0 items-center rounded-full pr-1 pl-2.5 text-sm text-gray-500 active:bg-gray-100"
        >
          도시{citiesVisited(code) > 0 && ` ${citiesVisited(code)}곳`}
          <ChevronRightIcon width={16} height={16} />
        </Link>
      )}
      <input
        id={`country-${code}`}
        type="checkbox"
        checked={visited.has(code)}
        onChange={(event) => void change(code, event.target.checked, false)}
        className="ml-2 size-5 shrink-0 accent-brand-600"
      />
    </li>
  );

  return (
    <>
      <div className="px-4 pt-5">
        <p className="text-sm font-semibold text-gray-500">다녀온 나라</p>
        <p className="mt-0.5 text-3xl font-bold">
          {status === 'ready' ? `${visited.size}곳` : ' '}
        </p>
      </div>
      <div className="mx-4 mt-4 rounded-2xl bg-gray-50 p-3">
        <WorldMap
          visited={visited}
          label={['다녀온 나라 지도', ...visitedNames.map(countryName)].join(', ')}
          onPick={(code) => void change(code, !visited.has(code), true)}
        />
      </div>
      <p className="px-4 pt-2 text-xs break-keep text-gray-400">
        지도에서 나라를 누르면 넣거나 빼요. 작은 나라와 도시는 아래에서 이름으로 찾아요.
      </p>

      <PageSection title="나라 찾기">
        <TextField
          label="나라나 도시 이름"
          type="search"
          placeholder="예: 일본, 파리"
          autoComplete="off"
          enterKeyHint="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query.trim() &&
          (found.length > 0 ? (
            <ul className="mt-2 divide-y divide-gray-100">
              {found.map((match) => row(match.code, match.places))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-gray-500">찾는 나라가 없어요.</p>
          ))}
      </PageSection>

      {!query.trim() && (
        <PageSection title={`다녀온 나라 ${visited.size}곳`}>
          {visitedNames.length > 0 ? (
            <ul className="divide-y divide-gray-100">{visitedNames.map((code) => row(code))}</ul>
          ) : (
            <p className="text-sm break-keep text-gray-500">
              아직 없어요. 지도에서 누르거나 이름으로 찾아 넣어 보세요.
            </p>
          )}
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
