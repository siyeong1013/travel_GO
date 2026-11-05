import { useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { CloseIcon, PlusIcon } from '@/components/ui/icons';
import { MAX_TRIP_COUNTRIES } from '@/data/rules/validation';
import { COUNTRY_CODES } from '@/features/countries/countryCodes';
import { byName, countryName, flagOf, searchCountries } from '@/features/countries/countryNames';

interface TripCountriesFieldProps {
  countries: string[];
  onChange: (countries: string[]) => void;
}

/** The countries a trip goes to, passing-through ones too, picked from a list; kept in that order. */
export function TripCountriesField({ countries, onChange }: TripCountriesFieldProps) {
  const [picking, setPicking] = useState(false);
  return (
    <section aria-labelledby="trip-countries" className="flex flex-col gap-1.5">
      <h2 id="trip-countries" className="text-sm font-semibold text-gray-700">
        나라
      </h2>
      <ul className="flex flex-wrap gap-2">
        {countries.map((code) => (
          <li key={code} className="flex h-11 items-center rounded-full bg-gray-100 pl-3.5 text-[15px]">
            <span aria-hidden="true" className="mr-1.5">
              {flagOf(code)}
            </span>
            {countryName(code)}
            <button
              type="button"
              aria-label={`${countryName(code)} 빼기`}
              onClick={() => onChange(countries.filter((other) => other !== code))}
              className="flex size-11 items-center justify-center rounded-full text-gray-500 active:bg-gray-200"
            >
              <CloseIcon width={16} height={16} />
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="flex h-11 items-center gap-1 rounded-full border border-dashed border-gray-300 px-4 text-[15px] font-semibold text-brand-600 active:bg-gray-50"
          >
            <PlusIcon width={16} height={16} />
            {countries.length > 0 ? '나라 더 고르기' : '나라 고르기'}
          </button>
        </li>
      </ul>
      <p className="text-sm break-keep text-gray-500">
        지나가는 나라도 넣어요. 도시는 고른 나라 안에서 찾고, 여행이 시작되면 다녀온 나라에 칠해져요.
      </p>
      <BottomSheet open={picking} onClose={() => setPicking(false)} title="가는 나라">
        <CountryPicker countries={countries} onChange={onChange} onDone={() => setPicking(false)} />
      </BottomSheet>
    </section>
  );
}

interface CountryPickerProps extends TripCountriesFieldProps {
  onDone: () => void;
}

function CountryPicker({ countries, onChange, onDone }: CountryPickerProps) {
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  // Those picked on top, as the sheet opened: rows don't jump while they are ticked.
  const [order] = useState(() => [
    ...countries,
    ...byName(COUNTRY_CODES.filter((code) => !countries.includes(code))),
  ]);
  const shown = query.trim() ? searchCountries(query) : order;

  function toggle(code: string, picked: boolean) {
    if (!picked) {
      onChange(countries.filter((other) => other !== code));
    } else if (countries.length >= MAX_TRIP_COUNTRIES) {
      setMessage(`나라는 ${MAX_TRIP_COUNTRIES}개까지 고를 수 있어요.`);
      return;
    } else {
      onChange([...countries, code]);
    }
    setMessage(null);
  }

  return (
    <div className="flex h-[70dvh] flex-col">
      <div className="px-2">
        <TextField
          label="나라 이름"
          type="search"
          placeholder="예: 일본, 사이판"
          autoComplete="off"
          enterKeyHint="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          // The sheet is inside the trip form: Enter here isn't sending it.
          onKeyDown={(event) => event.key === 'Enter' && event.preventDefault()}
        />
      </div>
      <ul aria-label="나라" className="mt-2 flex-1 divide-y divide-gray-100 overflow-y-auto px-2">
        {shown.map((code) => (
          <li key={code}>
            <label className="flex min-h-12 items-center gap-3 px-1">
              <span aria-hidden="true" className="text-xl">
                {flagOf(code)}
              </span>
              <span className="min-w-0 flex-1 truncate text-base">{countryName(code)}</span>
              <input
                type="checkbox"
                checked={countries.includes(code)}
                onChange={(event) => toggle(code, event.target.checked)}
                className="size-5 accent-brand-600"
              />
            </label>
          </li>
        ))}
        {shown.length === 0 && <li className="py-3 text-sm text-gray-500">찾는 나라가 없어요.</li>}
      </ul>
      <div className="px-2 pt-3 pb-2">
        {message && (
          <p role="alert" className="mb-2 text-center text-sm text-red-500">
            {message}
          </p>
        )}
        <Button block onClick={onDone}>
          {countries.length > 0 ? `${countries.length}개 나라 고르기` : '닫기'}
        </Button>
      </div>
    </div>
  );
}
