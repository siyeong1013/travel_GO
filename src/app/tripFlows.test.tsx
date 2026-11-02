/** @vitest-environment happy-dom */
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { repositories } from '@/data';
import { makePlace } from '@/test/fixtures';
import { renderApp, resetApp, resetStores } from '@/test/app';

// The app's singletons, backed by a throwaway database.
vi.mock('@/data', async () => {
  const { createTestRepositories } = await import('@/test/fixtures');
  return { repositories: createTestRepositories().repos };
});

beforeEach(resetApp);

const osaka = {
  title: '오사카 여행',
  city: { name: '오사카', placeId: null, location: null },
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
    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-11-10' } });
    expect(screen.getByLabelText('종료일')).toHaveValue('2026-11-10');
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-11-12' } });
    expect(screen.getByText('2박 3일')).toBeInTheDocument();

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
