import type { Repositories } from '@/data/repositories';

/** What changes the app's data. Refreshing or expiring Google's place data isn't an edit. */
const WRITES: { [K in keyof Repositories]: (keyof Repositories[K])[] } = {
  trips: ['create', 'update', 'delete'],
  schedule: ['create', 'update', 'delete', 'move'],
  companions: ['create', 'rename', 'delete'],
  expenses: ['create', 'update', 'delete'],
  settlements: ['create', 'delete'],
  backup: ['importAll'],
};

/** `repos`, calling `onWrite` after each change made through them goes through. */
export function watchWrites(repos: Repositories, onWrite: () => void): Repositories {
  function watch<R extends object>(repo: R, names: (keyof R)[]): R {
    const watched = { ...repo };
    for (const name of names) {
      const method = repo[name] as unknown as (...args: unknown[]) => Promise<unknown>;
      Object.assign(watched, {
        [name]: async (...args: unknown[]) => {
          const result = await method(...args);
          onWrite();
          return result;
        },
      });
    }
    return watched;
  }

  return {
    trips: watch(repos.trips, WRITES.trips),
    schedule: watch(repos.schedule, WRITES.schedule),
    companions: watch(repos.companions, WRITES.companions),
    expenses: watch(repos.expenses, WRITES.expenses),
    settlements: watch(repos.settlements, WRITES.settlements),
    backup: watch(repos.backup, WRITES.backup),
  };
}
