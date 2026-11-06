/** @vitest-environment happy-dom */
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { repositories } from '@/data';
import { addDays, toLocalDate } from '@/lib/dates';
import { renderApp, resetApp } from '@/test/app';
import { typedCity } from '@/test/fixtures';

vi.mock('@/data', async () => (await import('@/test/fixtures')).createTestData());

beforeEach(() => resetApp());

const total = () => screen.getByText(/^\d+곳$/);
const onMap = (code: string) => document.querySelector(`svg [data-code="${code}"]`)!;
const visited = async () => (await repositories.countries.list()).map((c) => c.id);

// The app keeps the maps it fetched: every test fetches the same Japan.
const JAPAN = {
  width: 100,
  height: 100,
  regions: [
    ['JP-01', '홋카이도', 'M60 0L90 0L90 20Z'],
    ['JP-13', '도쿄도', 'M0 0L10 0L10 10Z'],
    ['JP-27', '오사카부', 'M20 20L30 20L30 30Z'],
    ['JP-47', '오키나와현', 'M40 40L41 40L41 41Z', 40, 40],
  ],
  // The biggest built-up areas first; small cities have none.
  cities: [
    ['도쿄', 'JP-13', 5, 5, 'M4 4L6 4L6 6Z'],
    ['오사카', 'JP-27', 25, 25, 'M24 24L26 24L26 26Z'],
    ['삿포로', 'JP-01', 70, 10, 'M69 9L71 9L71 11Z'],
    ['나하', 'JP-47', 40, 40, ''],
    ['이시가키', 'JP-47', 41, 41, ''],
  ],
};

/** The countries' maps the app fetches: `maps` by country code, no others. */
function stubMaps(maps: Record<string, unknown>) {
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
    const country = /\/regions\/([A-Z]{2})\.json/.exec(String(input))?.[1];
    return country && maps[country] ? Response.json(maps[country]) : new Response('', { status: 404 });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('visited countries', () => {
  it('opens from the trip list', async () => {
    const { user } = renderApp('/');
    await user.click(await screen.findByRole('link', { name: '다녀온 나라' }));
    expect(await screen.findByRole('heading', { name: '다녀온 나라' })).toBeInTheDocument();
  });

  it('puts a country found by name on the map, back on top of the page, with undo', async () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const { user } = renderApp('/countries');
    expect(await screen.findByText('0곳')).toBeInTheDocument();
    // The map only shows.
    await user.click(onMap('JP'));
    expect(onMap('JP')).toHaveClass('fill-gray-200');

    // A tap on its name in the search checks it.
    const search = screen.getByLabelText('나라나 도시 이름');
    await user.type(search, '일본');
    await user.click(screen.getByText('일본'));
    // The search is done: back to the map, the list under it.
    expect(await screen.findByText('1곳')).toBeInTheDocument();
    expect(search).toHaveValue('');
    expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(onMap('JP')).toHaveClass('fill-brand-500');
    expect(screen.getByText('일본을 다녀온 나라에 넣었어요.')).toBeInTheDocument();
    const list = screen.getByRole('region', { name: '다녀온 나라 1곳' });
    expect(within(list).getByRole('checkbox', { name: '일본' })).toBeChecked();
    expect(await visited()).toEqual(['JP']);

    await user.click(screen.getByRole('button', { name: '되돌리기' }));
    await waitFor(() => expect(total()).toHaveTextContent('0곳'));
    expect(await visited()).toEqual([]);
  });

  it('finds small countries by name, and places by what people call them', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const { user } = renderApp('/countries');
    const search = await screen.findByLabelText('나라나 도시 이름');

    await user.type(search, '사이판');
    await user.click(screen.getByRole('checkbox', { name: '북마리아나 제도' }));
    expect(search).toHaveValue('');
    await user.type(search, '싱가');
    await user.click(screen.getByRole('checkbox', { name: '싱가포르' }));

    const list = await screen.findByRole('region', { name: '다녀온 나라 2곳' });
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '🇲🇵북마리아나 제도',
      '🇸🇬싱가포르',
    ]);
    expect(within(list).getAllByRole('checkbox', { checked: true })).toHaveLength(2);
    expect(await visited()).toEqual(['MP', 'SG']);
    // Too small to see: a dot once visited.
    expect(document.querySelector('svg circle[data-code="SG"]')).not.toBeNull();
  });

  it('takes a country off its list by the checkbox only, with undo', async () => {
    await repositories.countries.set('MP', true);
    await repositories.countries.set('SG', true);
    const { user } = renderApp('/countries');
    const list = await screen.findByRole('region', { name: '다녀온 나라 2곳' });

    // A tap on its name leaves it be (had it taken it off, the box would put it back on).
    await user.click(within(list).getByText('싱가포르'));
    await user.click(within(list).getByRole('checkbox', { name: '싱가포르' }));
    expect(await screen.findByRole('region', { name: '다녀온 나라 1곳' })).toBeInTheDocument();
    expect(screen.getByText('싱가포르를 다녀온 나라에서 뺐어요.')).toBeInTheDocument();
    expect(document.querySelector('svg circle[data-code="SG"]')).toBeNull();
    expect(await visited()).toEqual(['MP']);

    await user.click(screen.getByRole('button', { name: '되돌리기' }));
    expect(await screen.findByRole('region', { name: '다녀온 나라 2곳' })).toBeInTheDocument();
  });

  it('finds countries by a city in them, and opens their cities on it', async () => {
    const FRANCE = {
      width: 100,
      height: 100,
      regions: [
        ['FR-IDF', '일드프랑스', 'M0 0L10 0L10 10Z'],
        ['FR-PAC', '프로방스알프코트다쥐르', 'M20 20L30 20L30 30Z'],
      ],
      cities: [
        ['파리', 'FR-IDF', 5, 5, 'M4 4L6 4L6 6Z'],
        ['니스', 'FR-PAC', 25, 25, ''],
      ],
    };
    stubMaps({ FR: FRANCE });
    const { user } = renderApp('/countries');
    await user.type(await screen.findByLabelText('나라나 도시 이름'), '파리');
    expect(screen.getByRole('checkbox', { name: '프랑스 파리' })).not.toBeChecked();

    await user.click(screen.getByRole('link', { name: '프랑스 도시' }));
    expect(await screen.findByLabelText('도시나 지역 이름')).toHaveValue('파리');
    const list = await screen.findByRole('list', { name: '도시' });
    await waitFor(() => expect(within(list).getAllByRole('checkbox')).toHaveLength(1));
    // A city puts its country on too.
    await user.click(within(list).getByRole('checkbox', { name: /^파리 일드프랑스/ }));
    await waitFor(async () => expect(await visited()).toEqual(['FR', 'FR-IDF:파리']));

    // Back: the countries, the search done.
    await user.click(screen.getByRole('button', { name: '뒤로' }));
    expect(await screen.findByLabelText('나라나 도시 이름')).toHaveValue('');
    const countries = await screen.findByRole('region', { name: '다녀온 나라 1곳' });
    expect(within(countries).getByRole('link', { name: '프랑스 도시' })).toHaveTextContent('도시 1곳');
  });

  it('says when no country has the name', async () => {
    const { user } = renderApp('/countries');
    await user.type(await screen.findByLabelText('나라나 도시 이름'), '아틀란티스');
    expect(screen.getByText('찾는 나라가 없어요.')).toBeInTheDocument();
  });
});

describe("trips' countries", () => {
  const trip = (startDate: string, countries: string[]) =>
    repositories.trips.create({
      title: '여행',
      countries,
      cities: [typedCity('도시')],
      startDate,
      endDate: addDays(startDate, 2),
    });

  it('go on the map once the trip has begun', async () => {
    const today = toLocalDate();
    await trip(addDays(today, -1), ['TW', 'JP']);
    await trip(addDays(today, 10), ['VN']);
    renderApp('/countries');
    expect(await screen.findByText('2곳')).toBeInTheDocument();
    const list = screen.getByRole('region', { name: '다녀온 나라 2곳' });
    expect(within(list).getAllByRole('checkbox', { checked: true })).toHaveLength(2);
    expect(within(list).getByText('대만')).toBeInTheDocument();
    expect(within(list).queryByText('베트남')).toBeNull();
  });

  it('stay off when taken off after the trip began', async () => {
    // Taken off on the test clock's day (2026-01-01), after the trip began.
    await trip('2025-12-20', ['TW']);
    await repositories.countries.set('TW', false);
    renderApp('/countries');
    // The count shows once the page has read them, after the marking.
    expect(await screen.findByText('0곳')).toBeInTheDocument();
    expect(await repositories.countries.list()).toEqual([]);
  });

  const japanTrip = (startDate: string, ...cities: string[]) =>
    repositories.trips.create({
      title: '일본 여행',
      countries: ['JP'],
      cities: cities.map(typedCity),
      startDate,
      endDate: addDays(startDate, 2),
    });

  it('go on the map with their cities', async () => {
    const fetch = stubMaps({ JP: JAPAN });
    const today = toLocalDate();
    // A city written another way, a region (no city), and a name it doesn't know.
    await japanTrip(addDays(today, -1), '오사카시', '홋카이도', '아틀란티스');
    await japanTrip(addDays(today, 10), '나하');
    renderApp('/countries');
    expect(await screen.findByText('1곳')).toBeInTheDocument();
    expect(await visited()).toEqual(['JP', 'JP-27:오사카']);
    expect(String(fetch.mock.calls[0]![0])).toBe('/regions/JP.json?v=2');
  });

  it('leave a city off when taken off after the trip began', async () => {
    stubMaps({ JP: JAPAN });
    await japanTrip('2025-12-20', '오사카');
    await repositories.countries.set('JP-27:오사카', false);
    renderApp('/countries');
    expect(await screen.findByText('1곳')).toBeInTheDocument();
    expect(await visited()).toEqual(['JP']);
  });
});

describe('cities of a country', () => {
  it("open from the country's row; a city checked fills in and puts the country on the map", async () => {
    stubMaps({ JP: JAPAN });
    const { user } = renderApp('/countries');
    await user.type(await screen.findByLabelText('나라나 도시 이름'), '일본');
    await user.click(screen.getByRole('link', { name: '일본 도시' }));

    expect(await screen.findByRole('heading', { level: 1, name: '일본' })).toBeInTheDocument();
    await screen.findByRole('img', { name: '일본 지도' });
    expect(await screen.findByText('0곳')).toBeInTheDocument();
    // The regions are under the cities, and the map only shows.
    expect(onMap('JP-27')).toBeNull();
    await user.click(onMap('JP-27:오사카'));
    expect(onMap('JP-27:오사카')).toHaveClass('fill-gray-400');

    const list = screen.getByRole('list', { name: '도시' });
    await user.click(within(list).getByRole('checkbox', { name: /^오사카 오사카부/ }));
    expect(await screen.findByText('1곳')).toBeInTheDocument();
    expect(onMap('JP-27:오사카')).toHaveClass('fill-brand-500');
    expect(await visited()).toEqual(['JP', 'JP-27:오사카']);

    // Too small to draw: by name, or by its region's, then a dot on the map.
    await user.type(screen.getByLabelText('도시나 지역 이름'), '오키나와');
    expect(within(list).getAllByRole('checkbox')).toHaveLength(2);
    await user.click(within(list).getByRole('checkbox', { name: /^이시가키 오키나와현/ }));
    await waitFor(() => expect(document.querySelector('svg circle[data-code="JP-47:이시가키"]')).not.toBeNull());
  });

  it("say when the map didn't come, and try again", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { user } = renderApp('/countries/TH');
    expect(await screen.findByText('지도를 불러오지 못했어요.')).toBeInTheDocument();
    const fetch = stubMaps({
      TH: { width: 100, height: 100, regions: [['TH-10', '방콕', 'M0 0L9 0L9 9Z']], cities: [['방콕', 'TH-10', 4, 4, '']] },
    });
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByRole('img', { name: '태국 지도' })).toBeInTheDocument();
    expect(String(fetch.mock.calls[0]![0])).toBe('/regions/TH.json?v=2');
  });
});
