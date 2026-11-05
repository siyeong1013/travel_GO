/** @vitest-environment happy-dom */
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp, resetApp, resetStores } from '@/test/app';

vi.mock('@/data', async () => (await import('@/test/fixtures')).createTestData());

beforeEach(resetApp);
afterEach(() => vi.restoreAllMocks());

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';

function onIphone({ fromHomeScreen = false } = {}) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE);
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({
        matches: fromHomeScreen && query === '(display-mode: standalone)',
        media: query,
      }) as MediaQueryList,
  );
}

const banner = () => screen.queryByRole('region', { name: '홈 화면에 추가해 주세요' });

async function openGuide(user: ReturnType<typeof renderApp>['user']) {
  await user.click(screen.getByRole('button', { name: '추가하는 방법 보기' }));
  const guide = screen.getByRole('dialog', { name: '홈 화면에 추가하기' });
  // Each step's text, without its number circle (the list numbers the steps).
  const steps = within(guide)
    .getAllByRole('listitem')
    .map((step) => step.querySelector('p')!.textContent);
  expect(steps).toEqual([
    'Safari의 공유 버튼을 눌러요. 안 보이면 ⋯ 버튼을 먼저 눌러요.',
    '‘홈 화면에 추가’를 골라요. 안 보이면 목록을 위로 밀어 보세요.',
    '오른쪽 위의 ‘추가’를 누르면 홈 화면에 travel GO가 생겨요.',
  ]);
  await user.click(within(guide).getByRole('button', { name: '확인' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
}

describe('adding the app to the home screen (iOS)', () => {
  it('suggests it on the trip list until closed, and keeps the steps in settings', async () => {
    onIphone();
    const { user } = renderApp('/');
    await screen.findByText('아직 여행이 없어요');
    expect(banner()).toHaveTextContent('앱처럼 바로 열리고, 여행 기록도 안전하게 남아요.');

    await openGuide(user);
    // Seeing the steps doesn't close the suggestion: only its close button does.
    expect(banner()).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '설치 안내 닫기' }));
    expect(banner()).not.toBeInTheDocument();

    // Not after reopening the app either.
    cleanup();
    resetStores();
    const app = renderApp('/');
    await screen.findByText('아직 여행이 없어요');
    expect(banner()).not.toBeInTheDocument();

    await app.user.click(screen.getByRole('link', { name: '설정' }));
    expect(await screen.findByRole('region', { name: '홈 화면에 추가' })).toBeInTheDocument();
    await openGuide(app.user);
  });

  it('says nothing about it once added, or outside iOS', async () => {
    onIphone({ fromHomeScreen: true });
    renderApp('/');
    await screen.findByText('아직 여행이 없어요');
    expect(banner()).not.toBeInTheDocument();

    vi.restoreAllMocks();
    cleanup();
    resetStores();
    const { user } = renderApp('/');
    await screen.findByText('아직 여행이 없어요');
    expect(banner()).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: '설정' }));
    await screen.findByRole('region', { name: '백업 내보내기' });
    expect(screen.queryByRole('region', { name: '홈 화면에 추가' })).not.toBeInTheDocument();
  });
});
