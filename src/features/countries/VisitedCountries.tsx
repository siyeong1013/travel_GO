import { useEffect, useMemo, useRef, useState } from 'react';
import { TextField } from '@/components/ui/Field';
import { PageSection } from '@/components/ui/PageSection';
import { Snackbar } from '@/components/ui/Snackbar';
import { byName, countryName, flagOf, searchCountries } from '@/features/countries/countryNames';
import { useCountryStore } from '@/features/countries/countryStore';
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
 * or takes off (with an undo), and a search by name for the rest, small ones included.
 */
export function VisitedCountries() {
  const countries = useCountryStore((state) => state.countries);
  const status = useCountryStore((state) => state.status);
  const load = useCountryStore((state) => state.load);
  const setVisited = useCountryStore((state) => state.setVisited);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const notices = useRef(0);

  useEffect(() => {
    void load();
  }, [load]);

  const visited = useMemo(() => new Set(countries.map((country) => country.id)), [countries]);
  const visitedNames = byName([...visited]);
  const found = searchCountries(query);

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

  const row = (code: string) => (
    <li key={code}>
      <label className="flex min-h-12 items-center gap-3 px-1">
        <span aria-hidden="true" className="text-xl">
          {flagOf(code)}
        </span>
        <span className="min-w-0 flex-1 truncate text-base">{countryName(code)}</span>
        <input
          type="checkbox"
          checked={visited.has(code)}
          onChange={(event) => void change(code, event.target.checked, false)}
          className="size-5 accent-brand-600"
        />
      </label>
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
        지도에서 나라를 누르면 넣거나 빼요. 작은 나라는 아래에서 이름으로 찾아요.
      </p>

      <PageSection title="나라 찾기">
        <TextField
          label="나라 이름"
          type="search"
          placeholder="예: 일본, 사이판"
          autoComplete="off"
          enterKeyHint="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query.trim() &&
          (found.length > 0 ? (
            <ul className="mt-2 divide-y divide-gray-100">{found.map(row)}</ul>
          ) : (
            <p className="mt-3 text-sm text-gray-500">찾는 나라가 없어요.</p>
          ))}
      </PageSection>

      {!query.trim() && (
        <PageSection title={`다녀온 나라 ${visited.size}곳`}>
          {visitedNames.length > 0 ? (
            <ul className="divide-y divide-gray-100">{visitedNames.map(row)}</ul>
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
