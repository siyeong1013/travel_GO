import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSyncDatabase, type SyncDatabase } from '@/test/syncDatabase';

// The server side of "다녀온 나라" (supabase/migrations/*_countries.sql) on a real Postgres.

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const T1 = '2026-11-05T01:00:00.000Z';
const T2 = '2026-11-05T02:00:00.000Z';

let server: SyncDatabase;
beforeAll(async () => {
  server = await createSyncDatabase();
});
afterAll(() => server.close());
beforeEach(async () => {
  await server.reset();
  await server.addUser(A);
  await server.addUser(B);
});

describe('visited countries on the server', () => {
  it('keeps the later change per country', async () => {
    const a = server.serverFor(A);
    await a.saveCountries([
      { id: 'JP', visited: true, updatedAt: T2 },
      { id: 'TW', visited: true, updatedAt: T1 },
    ]);
    // An older uncheck of Japan loses; a newer one of Taiwan wins.
    await a.saveCountries([
      { id: 'JP', visited: false, updatedAt: T1 },
      { id: 'TW', visited: false, updatedAt: T2 },
    ]);
    expect(await a.countries()).toEqual(
      expect.arrayContaining([
        { id: 'JP', visited: true, updatedAt: T2 },
        { id: 'TW', visited: false, updatedAt: T2 },
      ]),
    );
  });

  it('shows each account only its own', async () => {
    await server.serverFor(A).saveCountries([{ id: 'JP', visited: true, updatedAt: T1 }]);
    expect(await server.serverFor(B).countries()).toEqual([]);
  });

  it('takes changes only from a signed-in account, and only country codes', async () => {
    const save = (userId: string | null, code: string) =>
      server.as(userId, (tx) =>
        tx.query('select public.save_visited_countries($1::jsonb)', [
          JSON.stringify([{ code, visited: true, updatedAt: T1 }]),
        ]),
      );
    await expect(save(null, 'JP')).rejects.toThrow();
    await expect(save(A, 'japan')).rejects.toThrow();
    await expect(save(A, 'JP-1234')).rejects.toThrow();
    // A region of a country is kept too, and a city of its map.
    await save(A, 'JP-27');
    await save(A, 'JP-01:삿포로');
    expect((await server.serverFor(A).countries()).map((c) => c.id).sort()).toEqual(['JP-01:삿포로', 'JP-27']);
    await expect(save(A, 'JP-01:')).rejects.toThrow();
    await expect(save(A, 'JP-01:a:b')).rejects.toThrow();
    await expect(save(A, `JP:${'가'.repeat(80)}`)).rejects.toThrow();
    // No writing around the function.
    await expect(
      server.as(A, (tx) =>
        tx.query(
          `insert into public.visited_countries values ($1, 'JP', true, now())`,
          [A],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
