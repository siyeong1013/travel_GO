/** @vitest-environment happy-dom */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { repositories } from '@/data';
import type { Trip } from '@/data/models';
import { renderApp, resetApp, resetStores } from '@/test/app';

vi.mock('@/data', async () => (await import('@/test/fixtures')).createTestData());

let trip: Trip;

beforeEach(async () => {
  await resetApp();
  trip = await repositories.trips.create({
    title: '오사카 여행',
    cities: [{ name: '오사카', placeId: null, location: null, fetchedAt: null }],
    startDate: '2026-11-10',
    endDate: '2026-11-12',
  });
});

/** "1오사카성"-style text of each card in the open tab (number + name + extras). */
const cards = () =>
  within(screen.getByRole('tabpanel'))
    .queryAllByRole('listitem')
    .map((li) => li.textContent);

/** The card's edit button (not its "… 순서 바꾸기" drag handle). */
const card = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name}(?! 순서 바꾸기)`) });
const findCard = (name: string) =>
  screen.findByRole('button', { name: new RegExp(`^${name}(?! 순서 바꾸기)`) });

describe('schedule flows', () => {
  it('adds, edits, moves and deletes places across days and the inbox', async () => {
    // Explicit day: the default depends on today's date.
    const { router, user } = renderApp(`/trips/${trip.id}?day=2026-11-10`);
    expect(await screen.findByRole('tab', { name: /Day 1/, selected: true })).toBeInTheDocument();
    expect(await screen.findByText('아직 일정이 없어요')).toBeInTheDocument();

    for (const name of ['오사카성', '도톤보리']) {
      await user.click(screen.getByRole('button', { name: 'Day 1에 장소 추가' }));
      expect(screen.getByText('Day 1 · 11.10 (화)에 추가돼요.')).toBeInTheDocument();
      await user.type(screen.getByLabelText('장소 이름'), name);
      await user.click(screen.getByRole('button', { name: '추가' }));
      await findCard(name);
    }
    expect(cards()).toEqual(['1오사카성', '2도톤보리']);
    expect(screen.getByRole('button', { name: '오사카성 순서 바꾸기' })).toHaveAttribute(
      'aria-roledescription',
      '순서 바꾸기',
    );

    // Time and memo
    await user.click(card('오사카성'));
    fireEvent.change(await screen.findByLabelText('시간'), { target: { value: '09:30' } });
    await user.type(screen.getByLabelText('메모'), '입장권 예매');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(cards()).toEqual(['1오사카성09:30입장권 예매', '2도톤보리']));

    // Move to the inbox from the edit sheet
    await user.click(card('도톤보리'));
    await user.selectOptions(await screen.findByLabelText('날짜'), '보관함');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(cards()).toEqual(['1오사카성09:30입장권 예매']));
    // (Not by role: dnd-kit's screen reader live region is a `status` too.)
    expect(await screen.findByText('도톤보리를 보관함으로 옮겼어요.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /보관함/ })).toHaveTextContent('일정 1개');

    // The inbox tab, and the URL remembers it
    await user.click(screen.getByRole('tab', { name: /보관함/ }));
    expect(router.state.location.search).toBe('?day=inbox');
    expect(cards()).toEqual(['도톤보리']);

    // Delete, with confirmation
    await user.click(card('도톤보리'));
    await user.click(await screen.findByRole('button', { name: '일정 삭제' }));
    expect(screen.getByText("'도톤보리' 일정을 삭제할까요?")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '삭제' }));
    expect(await screen.findByText('보관함이 비어 있어요')).toBeInTheDocument();
    // The editor and its confirmation closed together: the page scrolls again.
    expect(document.documentElement.style.overflow).toBe('');

    // Reload: Day 1 kept its edits
    cleanup();
    resetStores();
    renderApp(`/trips/${trip.id}?day=2026-11-10`);
    await waitFor(() => expect(cards()).toEqual(['1오사카성09:30입장권 예매']));
  });

  it('keeps unsaved edits when the delete is cancelled', async () => {
    await repositories.schedule.create({
      tripId: trip.id,
      date: '2026-11-11',
      place: { placeId: null, name: '유니버설 스튜디오', address: null, location: null, fetchedAt: null },
    });
    const { user } = renderApp(`/trips/${trip.id}?day=2026-11-11`);

    await user.click(await findCard('유니버설 스튜디오'));
    const memo = await screen.findByLabelText('메모');
    await user.type(memo, '익스프레스 패스');
    await user.click(screen.getByRole('button', { name: '일정 삭제' }));
    await user.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.getByLabelText('메모')).toHaveValue('익스프레스 패스');
    expect(await repositories.schedule.listByTrip(trip.id)).toHaveLength(1);
  });

  it('can undo moving a place to another day', async () => {
    for (const name of ['오사카성', '구로몬 시장', '도톤보리']) {
      await repositories.schedule.create({
        tripId: trip.id,
        date: '2026-11-10',
        place: { placeId: null, name, address: null, location: null, fetchedAt: null },
      });
    }
    const { user } = renderApp(`/trips/${trip.id}?day=2026-11-10`);

    await user.click(await findCard('구로몬 시장'));
    await user.selectOptions(await screen.findByLabelText('날짜'), 'Day 3 · 11.12 (목)');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(cards()).toEqual(['1오사카성', '2도톤보리']));
    expect(await screen.findByText('구로몬 시장을 Day 3으로 옮겼어요.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '되돌리기' }));
    await waitFor(() => expect(cards()).toEqual(['1오사카성', '2구로몬 시장', '3도톤보리']));
    expect(screen.queryByText('구로몬 시장을 Day 3으로 옮겼어요.')).not.toBeInTheDocument();
  });

  it('switches days with the arrow keys', async () => {
    const { user } = renderApp(`/trips/${trip.id}?day=2026-11-10`);
    const day1 = await screen.findByRole('tab', { name: /Day 1/, selected: true });

    day1.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /Day 2/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Day 2/ })).toHaveFocus();

    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: /보관함/ })).toHaveAttribute('aria-selected', 'true');
  });
});
