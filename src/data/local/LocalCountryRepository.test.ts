import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TravelGoDB } from '@/data/local';
import { ValidationError } from '@/data/repositories';
import { createTestRepositories } from '@/test/fixtures';

let db: TravelGoDB;
let repos: ReturnType<typeof createTestRepositories>['repos'];

beforeEach(() => {
  ({ db, repos } = createTestRepositories());
});
afterEach(() => db.delete());

describe('LocalCountryRepository', () => {
  it('puts countries on the map and takes them off, keeping the change', async () => {
    await repos.countries.set('JP', true);
    await repos.countries.set('TW', true);
    expect((await repos.countries.list()).map((c) => c.id)).toEqual(['JP', 'TW']);

    const off = await repos.countries.set('JP', false);
    expect(off).toMatchObject({ id: 'JP', visited: false });
    expect((await repos.countries.list()).map((c) => c.id)).toEqual(['TW']);
    // Kept, so the change reaches the account's other devices.
    expect(await db.visitedCountries.get('JP')).toEqual(off);
    expect((await repos.countries.listAll()).map((c) => [c.id, c.visited])).toEqual([
      ['JP', false],
      ['TW', true],
    ]);
  });

  it('stamps a change after the version it was made on', async () => {
    const later = '2099-01-01T00:00:00.000Z';
    await db.visitedCountries.put({ id: 'JP', visited: true, updatedAt: later });
    expect((await repos.countries.set('JP', false)).updatedAt).toBe('2099-01-01T00:00:00.001Z');
  });

  it('takes regions of countries too, and refuses what is neither', async () => {
    expect(await repos.countries.set('JP-27', true)).toMatchObject({ id: 'JP-27', visited: true });
    await expect(repos.countries.set('jp', true)).rejects.toBeInstanceOf(ValidationError);
    await expect(repos.countries.set('JP-1234', true)).rejects.toBeInstanceOf(ValidationError);
  });
});
