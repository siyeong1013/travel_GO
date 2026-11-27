/** @vitest-environment happy-dom */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { repositories } from '@/data';
import type { Companion, Trip } from '@/data/models';
import { DEFAULT_CHECKLIST } from '@/data/rules/checklist';
import { renderApp, resetApp, resetStores } from '@/test/app';

vi.mock('@/data', async () => (await import('@/test/fixtures')).createTestData());

let trip: Trip;
let me: Companion;

beforeEach(async () => {
  await resetApp();
  trip = await repositories.trips.create({
    title: '오사카 여행',
    cities: [{ name: '오사카', placeId: null, location: null, fetchedAt: null }],
    startDate: '2026-11-10',
    endDate: '2026-11-12',
  });
  me = (await repositories.companions.listByTrip(trip.id))[0]!;
});

const checklistPath = () => `/trips/${trip.id}?tab=checklist`;
const region = (name: string) => screen.getByRole('region', { name });
/** The items of a part of the list, as their checkboxes name them. */
const names = (part: string) =>
  within(region(part))
    .queryAllByRole('checkbox')
    .map((box) => box.getAttribute('aria-labelledby'))
    .map((id) => document.getElementById(id!)!.textContent);
const packed = () =>
  screen.queryByRole('region', { name: /^챙긴 것/ })
    ? within(screen.getByRole('region', { name: /^챙긴 것/ }))
        .getAllByRole('checkbox')
        .map((box) => document.getElementById(box.getAttribute('aria-labelledby')!)!.textContent)
    : [];

/** Takes every item off a trip's checklist (a new trip starts with the default list). */
async function clearChecklist(tripId: string) {
  for (const item of await repositories.checklist.listByTrip(tripId)) {
    await repositories.checklist.delete(item.id);
  }
}

describe('checklist', () => {
  it('opens from the trip page with the default list a new trip starts with; checks stay', async () => {
    const { user } = renderApp(`/trips/${trip.id}`);
    await user.click(await screen.findByRole('link', { name: '준비물' }));
    await screen.findByRole('checkbox', { name: '여권' });
    expect(names('챙길 것')).toEqual([...DEFAULT_CHECKLIST]);

    await user.click(screen.getByRole('checkbox', { name: '여권' }));
    await waitFor(() => expect(packed()).toEqual(['여권']));
    expect(names('챙길 것')).not.toContain('여권');
    expect(names('챙길 것')).toHaveLength(DEFAULT_CHECKLIST.length - 1);
    // No count above the list: only the bar.
    expect(screen.queryByText(/개 챙겼어요/)).not.toBeInTheDocument();

    // Read again from storage (a new visit).
    cleanup();
    resetStores();
    renderApp(checklistPath());
    expect(await screen.findByRole('checkbox', { name: '여권' })).toBeChecked();
  });

  it('adds several at once, renames, assigns, and shows only mine', async () => {
    await clearChecklist(trip.id);
    const chulsoo = await repositories.companions.create({ tripId: trip.id, name: '철수' });
    const { user } = renderApp(checklistPath());

    await user.click(await screen.findByRole('button', { name: '준비물 추가' }));
    const sheet = await screen.findByRole('dialog', { name: '준비물 추가' });
    await user.click(within(sheet).getByRole('button', { name: '추가' }));
    expect(within(sheet).getByText('준비물 이름을 입력해 주세요.')).toBeInTheDocument();

    await user.type(within(sheet).getByLabelText('준비물'), '여권, 드라이기{Enter}');
    expect(await screen.findByText('준비물 2개를 넣었어요.')).toBeInTheDocument();
    // Stays open for the next one, empty.
    expect(within(sheet).getByLabelText('준비물')).toHaveValue('');
    await user.type(within(sheet).getByLabelText('준비물'), '선크림{Enter}');
    expect(await screen.findByText('선크림을 넣었어요.')).toBeInTheDocument();
    // A tap on the backdrop (the dialog element itself) closes it.
    fireEvent.click(sheet);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(names('챙길 것')).toEqual(['여권', '드라이기', '선크림']);

    await user.click(screen.getByRole('button', { name: /^드라이기/ }));
    const edit = await screen.findByRole('dialog', { name: '준비물' });
    await user.clear(within(edit).getByLabelText('이름'));
    await user.type(within(edit).getByLabelText('이름'), '고데기');
    await user.selectOptions(within(edit).getByLabelText('챙길 사람'), '철수');
    await user.click(within(edit).getByRole('button', { name: '저장' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^고데기/ })).toHaveTextContent('고데기철수');

    const [passport] = await repositories.checklist.listByTrip(trip.id);
    await repositories.checklist.update(passport!.id, { assigneeId: me.id });
    cleanup();
    resetStores();
    renderApp(checklistPath());
    const mine = await screen.findByRole('button', { name: '내 담당만' });
    await user.click(mine);
    expect(mine).toHaveAttribute('aria-pressed', 'true');
    expect(names('챙길 것')).toEqual(['여권']);
    await user.click(mine);
    expect(names('챙길 것')).toEqual(['여권', '고데기', '선크림']);
    expect(chulsoo.name).toBe('철수');
  });

  it('deletes without asking, and brings it back with 되돌리기', async () => {
    await clearChecklist(trip.id);
    await repositories.checklist.add(trip.id, ['여권', '충전기', '우산']);
    const { user } = renderApp(checklistPath());

    await user.click(await screen.findByRole('button', { name: '충전기' }));
    const edit = await screen.findByRole('dialog', { name: '준비물' });
    // One person: nobody to pick.
    expect(within(edit).queryByLabelText('챙길 사람')).not.toBeInTheDocument();
    await user.click(within(edit).getByRole('button', { name: '삭제' }));

    expect(await screen.findByText('충전기를 삭제했어요.')).toBeInTheDocument();
    expect(names('챙길 것')).toEqual(['여권', '우산']);
    await user.click(screen.getByRole('button', { name: '되돌리기' }));
    await waitFor(() => expect(names('챙길 것')).toEqual(['여권', '충전기', '우산']));
  });

  it('starts again from the default list, or another trip’s, once emptied', async () => {
    const before = await repositories.trips.create({
      title: '도쿄 여행',
      cities: [{ name: '도쿄', placeId: null, location: null, fetchedAt: null }],
      startDate: '2026-05-01',
      endDate: '2026-05-03',
    });
    await clearChecklist(before.id);
    const [passport] = await repositories.checklist.add(before.id, ['여권', '선크림']);
    await repositories.checklist.update(passport!.id, { checked: true });
    await clearChecklist(trip.id);
    const { user } = renderApp(checklistPath());

    expect(await screen.findByText('아직 준비물이 없어요')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '기본 목록으로 시작' }));
    expect(await screen.findByText(`기본 준비물 ${DEFAULT_CHECKLIST.length}개를 넣었어요.`)).toBeInTheDocument();
    expect(names('챙길 것')).toEqual([...DEFAULT_CHECKLIST]);

    await clearChecklist(trip.id);
    cleanup();
    resetStores();
    renderApp(checklistPath());

    await user.click(await screen.findByRole('button', { name: '지난 여행에서 가져오기' }));
    const sheet = await screen.findByRole('dialog', { name: '지난 여행에서 가져오기' });
    await user.click(await within(sheet).findByRole('button', { name: /^도쿄 여행/ }));

    expect(await screen.findByText('준비물 2개를 가져왔어요.')).toBeInTheDocument();
    expect(names('챙길 것')).toEqual(['여권', '선크림']);
  });
});
