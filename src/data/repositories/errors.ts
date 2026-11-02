import type { ID } from '@/data/models';

export type RepositoryErrorCode =
  | 'not_found'
  | 'validation'
  | 'out_of_range_items'
  | 'backup_invalid'
  | 'backup_unsupported_version';

/**
 * Base class for errors thrown by repositories. The UI maps `code` to a message.
 *
 * Class names must not match a DOMException name (NotFoundError, DataError, ConstraintError,
 * AbortError, ...): Dexie re-wraps errors with those names thrown inside a transaction, so
 * `instanceof` would fail. Guarded by errors.test.ts.
 */
export class RepositoryError extends Error {
  readonly code: RepositoryErrorCode;

  constructor(code: RepositoryErrorCode, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class EntityNotFoundError extends RepositoryError {
  constructor(entity: 'trip' | 'scheduleItem', id: ID) {
    super('not_found', `${entity} not found: ${id}`);
  }
}

export class ValidationError extends RepositoryError {
  constructor(message: string) {
    super('validation', message);
  }
}

/** A trip's new dates would leave dated items outside the trip. See `TripUpdateOptions`. */
export class OutOfRangeItemsError extends RepositoryError {
  readonly count: number;

  constructor(count: number) {
    super('out_of_range_items', `${count} schedule item(s) fall outside the new trip dates`);
    this.count = count;
  }
}

export class BackupFormatError extends RepositoryError {
  constructor(code: 'backup_invalid' | 'backup_unsupported_version', message: string) {
    super(code, message);
  }
}
