/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it } from 'vitest';
import { hideSplash } from '@/app/splash';

/** A `wait` that holds each step until the test lets it go. */
function steps() {
  const waits: { ms: number; done: () => void }[] = [];
  const wait = (ms: number) => new Promise<void>((done) => waits.push({ ms, done }));
  return { waits, wait };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const splash = () => document.getElementById('splash');

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div><div id="splash"></div>';
});

describe('hideSplash', () => {
  it('stays up for the rest of its minimum time, fades out, then goes', async () => {
    const { waits, wait } = steps();
    const hidden = hideSplash(document, 300, wait);
    expect(waits.map((w) => w.ms)).toEqual([600]);
    expect(splash()!.classList.contains('splash-hidden')).toBe(false);

    waits[0]!.done();
    await settle();
    expect(splash()!.classList.contains('splash-hidden')).toBe(true);
    expect(waits.map((w) => w.ms)).toEqual([600, 300]);

    waits[1]!.done();
    await hidden;
    expect(splash()).toBeNull();
  });

  it('fades out right away when loading took longer', async () => {
    const { waits, wait } = steps();
    void hideSplash(document, 2_000, wait);
    expect(waits.map((w) => w.ms)).toEqual([0]);
  });

  it('runs once when called twice (StrictMode effects)', async () => {
    const { waits, wait } = steps();
    void hideSplash(document, 0, wait);
    await hideSplash(document, 0, wait);
    expect(waits).toHaveLength(1);
  });

  it('does nothing without a start screen', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    const { waits, wait } = steps();
    await hideSplash(document, 0, wait);
    expect(waits).toHaveLength(0);
  });
});
