/** @vitest-environment happy-dom */
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reloadOnChunkError } from '@/lib/chunkErrors';
import { renderApp, resetApp } from '@/test/app';

vi.mock('@/data', async () => (await import('@/test/fixtures')).createTestData());
// As when the app goes offline before it kept a screen's code, or an update removed it.
vi.mock('@/pages/SettingsPage', () => {
  throw new TypeError('Failed to fetch dynamically imported module');
});

beforeEach(resetApp);
afterEach(() => vi.restoreAllMocks());

describe('a screen whose code cannot be loaded', () => {
  it('says so in the app, with a way to try again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {});
    const { user } = renderApp('/');

    await user.click(await screen.findByRole('link', { name: '설정' }));
    expect(await screen.findByText('화면을 불러오지 못했어요')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(reload).toHaveBeenCalled();

    // The rest of the app still works.
    await user.click(screen.getByRole('button', { name: '뒤로' }));
    expect(await screen.findByText('아직 여행이 없어요')).toBeInTheDocument();
  });

  // Last: the page stays "reloading" for the rest of the file.
  it('stays on the screen shown while the page reloads into the new version', async () => {
    const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
    reloadOnChunkError(() => '/settings');
    const { user, router } = renderApp('/');
    await screen.findByText('아직 여행이 없어요');
    // Vite's loader reports a missing chunk just before the import fails: the page reloads into it.
    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));
    expect(assign).toHaveBeenCalledWith('/settings');

    // The failed screen neither shows an error nor gets a history entry on the way out.
    await user.click(screen.getByRole('link', { name: '설정' }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByText('화면을 불러오지 못했어요')).not.toBeInTheDocument();
    expect(screen.getByText('아직 여행이 없어요')).toBeInTheDocument();
    expect(router.state.navigation.state).toBe('loading');
    expect(router.state.location.pathname).toBe('/');
  });
});
