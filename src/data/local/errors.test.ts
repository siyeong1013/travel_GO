import { describe, expect, it } from 'vitest';
import {
  BackupFormatError,
  EntityNotFoundError,
  OutOfRangeItemsError,
  RepositoryError,
  ValidationError,
} from '@/data/repositories';
import { createTestRepositories } from '@/test/fixtures';

describe('repository errors', () => {
  it('pass through Dexie transactions unchanged', async () => {
    const { db } = createTestRepositories();
    const errors: RepositoryError[] = [
      new RepositoryError('validation', 'base'),
      new EntityNotFoundError('trip', 'x'),
      new ValidationError('x'),
      new OutOfRangeItemsError(1),
      new BackupFormatError('backup_invalid', 'x'),
    ];

    for (const error of errors) {
      const thrown = await db
        .transaction('rw', db.trips, () => {
          throw error;
        })
        .catch((e: unknown) => e);
      expect(thrown, error.name).toBe(error);
    }
    await db.delete();
  });
});
