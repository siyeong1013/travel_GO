import { afterEach, describe, expect, it, vi } from 'vitest';
import { derivedId, newId } from '@/lib/id';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('newId', () => {
  it('returns unique UUID v4 strings', () => {
    const ids = new Set(Array.from({ length: 100 }, () => newId()));
    expect(ids.size).toBe(100);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });

  it('works without crypto.randomUUID (insecure context)', () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });
    expect(crypto.randomUUID).toBeUndefined();
    expect(newId()).toMatch(UUID_V4);
  });
});

describe('derivedId', () => {
  it('gives the same UUID-shaped id for the same name, and different ids otherwise', () => {
    const id = derivedId('companion:me:trip-1');
    expect(id).toBe(derivedId('companion:me:trip-1'));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(derivedId('companion:me:trip-2')).not.toBe(id);
  });
});
