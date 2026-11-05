/** @vitest-environment happy-dom */
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { repositories } from '@/data';
import { renderApp, resetApp } from '@/test/app';

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
