import { describe, expect, it, vi } from 'vitest';
import { canShare, copyText, shareText } from '@/lib/share';

// Stubbed globals are restored after each test (test/setup.ts).
describe('copyText', () => {
  it('writes to the clipboard when there is one', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await copyText('정산')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('정산');
  });

  it('says so when there is none (insecure context) or it refuses', async () => {
    vi.stubGlobal('navigator', {});
    expect(await copyText('정산')).toBe(false);
    vi.stubGlobal('navigator', {
      clipboard: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) },
    });
    expect(await copyText('정산')).toBe(false);
  });
});

describe('shareText', () => {
  it('tells sharing, closing the sheet and failing apart', async () => {
    vi.stubGlobal('navigator', {});
    expect(canShare()).toBe(false);

    const share = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { share });
    expect(canShare()).toBe(true);
    expect(await shareText('정산')).toBe('shared');
    expect(share).toHaveBeenCalledWith({ text: '정산' });

    share.mockRejectedValueOnce(new DOMException('closed', 'AbortError'));
    expect(await shareText('정산')).toBe('cancelled');
    share.mockRejectedValueOnce(new DOMException('no gesture', 'NotAllowedError'));
    expect(await shareText('정산')).toBe('failed');
  });
});
