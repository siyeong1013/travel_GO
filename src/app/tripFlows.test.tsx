/** @vitest-environment happy-dom */
import { cleanup, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { repositories } from '@/data';
import { makePlace } from '@/test/fixtures';
import { pickTripDates, renderApp, resetApp, resetStores } from '@/test/app';

// The app's singletons, backed by a throwaway database.
vi.mock('@/data', async () => (await import('@/test/fixtures')).createTestData());

beforeEach(resetApp);

const osaka = {
  title: '오사카 여행',
  cities: [{ name: '오사카', placeId: null, location: null, fetchedAt: null }],
  startDate: '2026-11-10',
  endDate: '2026-11-12',
};

describe('trip flows', () => {
  it('creates a trip, and it is still there after a reload', async () => {
    const { router, user } = renderApp('/');
    expect(await screen.findByText('아직 여행이 없어요')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: '새 여행 만들기' }));
    await user.click(await screen.findByRole('button', { name: '만들기' }));
    expect(screen.getByText('여행 이름을 입력해 주세요.')).toBeInTheDocument();
    expect(screen.getByLabelText('여행 이름')).toHaveFocus();

    await user.type(screen.getByLabelText('여행 이름'), '오사카 여행');
    await user.type(screen.getByLabelText('도시'), '오사카');
    await pickTripDates(user, '2026-11-10', '2026-11-12');
    expect(screen.getByRole('button', { name: /^여행 기간 11\.10 \(화\) – 11\.12 \(목\) · 2박 3일$/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '만들기' }));
    expect(await screen.findByRole('heading', { name: '오사카 여행' })).toBeInTheDocument();
    expect(router.state.location.pathname).toMatch(/^\/trips\/[0-9a-f-]{36}$/);

    cleanup();
    resetStores();
    renderApp('/');
    const card = await screen.findByRole('link', { name: /오사카 여행/ });
    expect(card).toHaveTextContent('11.10 (화) – 11.12 (목) · 2박 3일');
  });

  it('deletes a trip and its items only after confirming', async () => {
    const trip = await repositories.trips.create(osaka);
    for (const name of ['오사카성', '도톤보리']) {
      await repositories.schedule.create({ tripId: trip.id, date: null, place: makePlace(name) });
    }
    const { router, user } = renderApp(`/trips/${trip.id}`);

    const openConfirm = async () => {
      await user.click(await screen.findByRole('button', { name: '여행 메뉴' }));
      await user.click(screen.getByRole('button', { name: '여행 삭제' }));
      expect(
        screen.getByText('이 여행의 일정 2개도 함께 삭제되고, 되돌릴 수 없어요.'),
      ).toBeInTheDocument();
    };

    await openConfirm();
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.queryByText(/되돌릴 수 없어요/)).not.toBeInTheDocument();
    expect(await repositories.trips.get(trip.id)).toBeDefined();

    await openConfirm();
    await user.click(screen.getByRole('button', { name: '삭제' }));
    expect(await screen.findByText('아직 여행이 없어요')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(await repositories.trips.get(trip.id)).toBeUndefined();
    expect(await repositories.schedule.listByTrip(trip.id)).toEqual([]);
  });

  it('shows a not-found state for an unknown trip', async () => {
    renderApp('/trips/does-not-exist');
    expect(await screen.findByText('여행을 찾을 수 없어요')).toBeInTheDocument();
  });
});

describe('editing a trip', () => {
  const openEdit = async (user: ReturnType<typeof renderApp>['user']) => {
    await user.click(await screen.findByRole('button', { name: '여행 메뉴' }));
    await user.click(screen.getByRole('button', { name: '여행 정보 수정' }));
  };

  it('saves new details and returns to the trip', async () => {
    const trip = await repositories.trips.create(osaka);
    const { router, user } = renderApp(`/trips/${trip.id}`);

    await openEdit(user);
    const title = await screen.findByLabelText('여행 이름');
    expect(title).toHaveValue('오사카 여행');
    await user.clear(title);
    await user.type(title, '간사이 여행');
    await pickTripDates(user, '2026-11-10', '2026-11-13');
    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByRole('heading', { name: '간사이 여행' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/trips/${trip.id}`);
    expect(screen.getByText('11.10 (화) – 11.13 (금) · 3박 4일')).toBeInTheDocument();
  });

  it('does not touch the trip when nothing changed', async () => {
    const trip = await repositories.trips.create(osaka);
    const { router, user } = renderApp(`/trips/${trip.id}/edit`);

    await user.click(await screen.findByRole('button', { name: '저장' }));

    await vi.waitFor(() => expect(router.state.location.pathname).toBe(`/trips/${trip.id}`));
    expect((await repositories.trips.get(trip.id))?.updatedAt).toBe(trip.updatedAt);
  });

  describe('shortening the dates', () => {
    async function tripWithItems() {
      const trip = await repositories.trips.create({ ...osaka, endDate: '2026-11-14' });
      for (const [date, name] of [
        ['2026-11-10', '오사카성'],
        ['2026-11-13', '교토'],
        ['2026-11-14', '간사이 공항'],
      ] as const) {
        await repositories.schedule.create({ tripId: trip.id, date, place: makePlace(name) });
      }
      return trip;
    }

    async function shortenTo12th(user: ReturnType<typeof renderApp>['user']) {
      await pickTripDates(user, '2026-11-10', '2026-11-12');
      await user.click(screen.getByRole('button', { name: '저장' }));
      expect(
        await screen.findByRole('heading', { name: '여행 기간 밖 일정 2개' }),
      ).toBeInTheDocument();
      expect(screen.getByText(/빠지는 날짜: 11\.13 \(금\), 11\.14 \(토\)/)).toBeInTheDocument();
    }

    const stored = async (tripId: string) =>
      (await repositories.schedule.listByTrip(tripId)).map((item) => [item.date, item.place.name]);

    it('changes nothing when cancelled', async () => {
      const trip = await tripWithItems();
      const { router, user } = renderApp(`/trips/${trip.id}/edit`);

      await shortenTo12th(user);
      await user.click(screen.getByRole('button', { name: '취소' }));

      expect(router.state.location.pathname).toBe(`/trips/${trip.id}/edit`);
      expect((await repositories.trips.get(trip.id))?.endDate).toBe('2026-11-14');
      expect(await stored(trip.id)).toHaveLength(3);
    });

    it('can move the items to the inbox', async () => {
      const trip = await tripWithItems();
      const { user } = renderApp(`/trips/${trip.id}/edit`);

      await shortenTo12th(user);
      await user.click(screen.getByRole('button', { name: '보관함으로 옮기기' }));

      expect(await screen.findByRole('tab', { name: /보관함/ })).toHaveTextContent('일정 2개');
      expect(screen.queryByRole('tab', { name: /Day 4/ })).not.toBeInTheDocument();
      expect(await stored(trip.id)).toEqual([
        ['2026-11-10', '오사카성'],
        [null, '교토'],
        [null, '간사이 공항'],
      ]);
    });

    it('can delete the items', async () => {
      const trip = await tripWithItems();
      const { user } = renderApp(`/trips/${trip.id}/edit`);

      await shortenTo12th(user);
      await user.click(screen.getByRole('button', { name: '일정 2개 삭제' }));

      expect(await screen.findByRole('tab', { name: /Day 3/ })).toBeInTheDocument();
      expect(await stored(trip.id)).toEqual([['2026-11-10', '오사카성']]);
    });
  });
});
