/** @vitest-environment happy-dom */
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { repositories } from '@/data';
import type { CoverPhoto } from '@/data/models';
import { prepareCoverPhoto } from '@/features/trips/coverPhoto';
import { coverStyle } from '@/features/trips/tripCover';
import { renderApp, resetApp, resetStores } from '@/test/app';
import { makeCover, typedCity } from '@/test/fixtures';

vi.mock('@/data', async () => {
  const { createTestRepositories } = await import('@/test/fixtures');
  return { repositories: createTestRepositories().repos };
});
// happy-dom can't decode or draw images: making photos smaller is checked in a real browser.
vi.mock('@/features/trips/coverPhoto', () => ({ prepareCoverPhoto: vi.fn() }));

beforeEach(async () => {
  await resetApp();
  vi.mocked(prepareCoverPhoto).mockReset();
});
afterEach(() => vi.restoreAllMocks());

// Far ahead, so the list puts them the same way whenever the tests run.
const osaka = {
  title: '오사카 여행',
  city: typedCity('오사카'),
  startDate: '2099-11-10',
  endDate: '2099-11-12',
};

const photo = (name: string, type = 'image/jpeg') => new File(['photo bytes'], name, { type });

/** Covers are decorative (`alt=""`), so they are found by the picture they show. */
const shown = (src: string) => document.querySelectorAll(`img[src="${src}"]`);

async function fillNewTrip(user: ReturnType<typeof renderApp>['user']) {
  await user.type(await screen.findByLabelText('여행 이름'), osaka.title);
  await user.type(screen.getByLabelText('도시'), osaka.city.name);
  fireEvent.change(screen.getByLabelText('시작일'), { target: { value: osaka.startDate } });
  fireEvent.change(screen.getByLabelText('종료일'), { target: { value: osaka.endDate } });
}

describe('cover photos', () => {
  it('makes a trip with a photo, shown on its page and in the list', async () => {
    let finish!: (cover: CoverPhoto) => void;
    vi.mocked(prepareCoverPhoto).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const { user } = renderApp('/trips/new');
    await fillNewTrip(user);
    expect(screen.getByText('고르지 않으면 이 색으로 꾸며요.')).toBeInTheDocument();

    const file = photo('castle.jpg');
    await user.upload(screen.getByLabelText('표지 사진 파일'), file);
    expect(prepareCoverPhoto).toHaveBeenCalledWith(file);
    // Saving now would leave the photo out.
    expect(screen.getByRole('button', { name: '사진 준비 중…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '만들기' })).toBeDisabled();

    finish(makeCover('castle'));
    expect(await screen.findByRole('img', { name: '고른 표지 사진' })).toHaveAttribute(
      'src',
      makeCover('castle').image,
    );
    await user.click(screen.getByRole('button', { name: '만들기' }));

    expect(await screen.findByRole('heading', { name: '오사카 여행' })).toBeInTheDocument();
    expect(shown(makeCover('castle').image)).toHaveLength(1);
    const [trip] = await repositories.trips.list();
    expect(trip!.cover).toEqual(makeCover('castle'));

    // The next trip's large card has the photo; rows have the thumbnail.
    await repositories.trips.create({
      ...osaka,
      title: '도쿄 여행',
      city: typedCity('도쿄'),
      startDate: '2099-12-01',
      endDate: '2099-12-03',
      cover: makeCover('tower'),
    });
    cleanup();
    resetStores();
    renderApp('/');
    await screen.findByRole('link', { name: /도쿄 여행/ });
    expect(shown(makeCover('castle').image)).toHaveLength(1);
    expect(shown(makeCover('tower').thumbnail)).toHaveLength(1);
  });

  it('changes the photo or takes it off when editing', async () => {
    const trip = await repositories.trips.create({ ...osaka, cover: makeCover('castle') });
    const { user } = renderApp(`/trips/${trip.id}/edit`);
    expect(await screen.findByRole('img', { name: '고른 표지 사진' })).toHaveAttribute(
      'src',
      makeCover('castle').image,
    );

    await user.click(screen.getByRole('button', { name: '사진 빼기' }));
    expect(screen.queryByRole('img', { name: '고른 표지 사진' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByRole('heading', { name: '오사카 여행' })).toBeInTheDocument();
    expect(shown(makeCover('castle').image)).toHaveLength(0);
    expect((await repositories.trips.get(trip.id))!.cover).toBeNull();

    vi.mocked(prepareCoverPhoto).mockResolvedValueOnce(makeCover('tower'));
    await user.click(screen.getByRole('button', { name: '여행 메뉴' }));
    await user.click(screen.getByRole('button', { name: '여행 정보 수정' }));
    await user.upload(await screen.findByLabelText('표지 사진 파일'), photo('tower.jpg'));
    await screen.findByRole('img', { name: '고른 표지 사진' });
    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByRole('heading', { name: '오사카 여행' })).toBeInTheDocument();
    expect(shown(makeCover('tower').image)).toHaveLength(1);
    expect((await repositories.trips.get(trip.id))!.cover).toEqual(makeCover('tower'));
  });

  it("says when a photo can't be read, and the trip is still made without one", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(prepareCoverPhoto).mockRejectedValueOnce(
      new DOMException('The source image cannot be decoded.', 'EncodingError'),
    );
    const { user } = renderApp('/trips/new');
    await fillNewTrip(user);

    await user.upload(screen.getByLabelText('표지 사진 파일'), photo('IMG_0001.heic', 'image/heic'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '이 사진은 열 수 없어요. 다른 사진을 골라 주세요.',
    );
    await user.click(screen.getByRole('button', { name: '만들기' }));

    expect(await screen.findByRole('heading', { name: '오사카 여행' })).toBeInTheDocument();
    expect((await repositories.trips.list())[0]!.cover).toBeNull();
  });

  it('shows a new trip its own color, which stays while typing and once made', async () => {
    // The form makes the trip's id when it opens; ids made after that are random again.
    const madeOnOpening = '0b5e8f3a-6c1d-4e2f-9a7b-3c4d5e6f7a8b';
    const uuid = vi.spyOn(crypto, 'randomUUID').mockReturnValue(madeOnOpening);
    const { user } = renderApp('/trips/new');
    const colorOf = async () =>
      (await screen.findByRole('button', { name: '사진 고르기' })).style.backgroundImage;
    const color = await colorOf();
    uuid.mockRestore();
    await fillNewTrip(user);
    expect(await colorOf()).toBe(color);
    await user.click(screen.getByRole('button', { name: '만들기' }));

    // The color was the trip's: picked by the id it was made with.
    const title = await screen.findByRole('heading', { name: '오사카 여행' });
    expect(title.closest('section')!.style.backgroundImage).toBe(color);
    const [trip] = await repositories.trips.list();
    expect(trip!.id).toBe(madeOnOpening);
    expect(coverStyle(trip!).backgroundImage).toBe(color);

    await user.click(screen.getByRole('button', { name: '여행 메뉴' }));
    await user.click(screen.getByRole('button', { name: '여행 정보 수정' }));
    expect(await colorOf()).toBe(color);
  });
});
