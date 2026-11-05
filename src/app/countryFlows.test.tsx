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

describe('visited countries', () => {
  it('opens from the trip list', async () => {
    const { user } = renderApp('/');
    await user.click(await screen.findByRole('link', { name: '다녀온 나라' }));
    expect(await screen.findByRole('heading', { name: '다녀온 나라' })).toBeInTheDocument();
  });

  it('puts a country on the map with a tap, and takes it off again with undo', async () => {
    const { user } = renderApp('/countries');
    expect(await screen.findByText('0곳')).toBeInTheDocument();

    await user.click(onMap('JP'));
    expect(await screen.findByText('1곳')).toBeInTheDocument();
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
    const { user } = renderApp('/countries');
    const search = await screen.findByLabelText('나라 이름');

    await user.type(search, '사이판');
    await user.click(screen.getByRole('checkbox', { name: '북마리아나 제도' }));
    await user.clear(search);
    await user.type(search, '싱가');
    await user.click(screen.getByRole('checkbox', { name: '싱가포르' }));
    await user.clear(search);

    const list = await screen.findByRole('region', { name: '다녀온 나라 2곳' });
    const boxes = within(list).getAllByRole<HTMLInputElement>('checkbox');
    expect(boxes.map((box) => [box.labels?.[0]?.textContent, box.checked])).toEqual([
      ['🇲🇵북마리아나 제도', true],
      ['🇸🇬싱가포르', true],
    ]);
    expect(await visited()).toEqual(['MP', 'SG']);
    // Too small to see: a dot once visited.
    expect(document.querySelector('svg circle[data-code="SG"]')).not.toBeNull();

    await user.click(within(list).getByRole('checkbox', { name: '싱가포르' }));
    expect(await screen.findByRole('region', { name: '다녀온 나라 1곳' })).toBeInTheDocument();
    expect(document.querySelector('svg circle[data-code="SG"]')).toBeNull();
  });

  it('says when no country has the name', async () => {
    const { user } = renderApp('/countries');
    await user.type(await screen.findByLabelText('나라 이름'), '아틀란티스');
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
});

describe('regions of a country', () => {
  const JAPAN = {
    width: 100,
    height: 100,
    regions: [
      ['JP-13', '도쿄도', 'M0 0L10 0L10 10Z'],
      ['JP-27', '오사카부', 'M20 20L30 20L30 30Z'],
      ['JP-47', '오키나와현', 'M40 40L41 40L41 41Z', 40, 40],
    ],
  };

  it("open from the country's row; a tap fills one in and puts the country on the map", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(JAPAN));
    vi.stubGlobal('fetch', fetch);
    const { user } = renderApp('/countries');
    await user.type(await screen.findByLabelText('나라 이름'), '일본');
    await user.click(screen.getByRole('link', { name: '일본 지역' }));

    expect(await screen.findByRole('heading', { level: 1, name: '일본' })).toBeInTheDocument();
    await screen.findByRole('img', { name: '일본 지도' });
    expect(String(fetch.mock.calls[0]![0])).toBe('/regions/JP.json');
    expect(await screen.findByText('0곳')).toBeInTheDocument();

    await user.click(document.querySelector('svg [data-code="JP-27"]')!);
    expect(await screen.findByText('오사카부를 다녀온 곳에 넣었어요.')).toBeInTheDocument();
    expect(screen.getByText('1곳')).toBeInTheDocument();
    expect((await repositories.countries.list()).map((mark) => mark.id)).toEqual(['JP', 'JP-27']);
    await user.click(screen.getByRole('button', { name: '되돌리기' }));
    await waitFor(async () =>
      expect((await repositories.countries.list()).map((mark) => mark.id)).toEqual(['JP']),
    );

    // Too small to tap on the map: by name.
    await user.type(screen.getByLabelText('지역 이름'), '오키');
    const list = screen.getByRole('list', { name: '지역' });
    expect(within(list).getAllByRole('checkbox')).toHaveLength(1);
    await user.click(within(list).getByRole('checkbox', { name: '오키나와현' }));
    await waitFor(() => expect(document.querySelector('svg circle[data-code="JP-47"]')).not.toBeNull());
  });

  it("say when the map didn't come, and try again", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { user } = renderApp('/countries/TH');
    expect(await screen.findByText('지도를 불러오지 못했어요.')).toBeInTheDocument();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...JAPAN, regions: [['TH-10', '방콕', 'M0 0L9 0L9 9Z']] })));
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByRole('img', { name: '태국 지도' })).toBeInTheDocument();
  });
});
