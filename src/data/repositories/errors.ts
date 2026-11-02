import type { ID, LocalDate } from '@/data/models';
import type { CompanionUsage } from '@/data/repositories/CompanionRepository';
import type { SplitError } from '@/data/rules/split';

export type RepositoryErrorCode =
  | 'not_found'
  | 'validation'
  | 'out_of_range_items'
  | 'companion_in_use'
  | 'currency_locked'
  | 'invalid_split'
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
  constructor(entity: 'trip' | 'scheduleItem' | 'companion' | 'expense', id: ID) {
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
  /** Days those items are on, ascending. */
  readonly dates: LocalDate[];

  constructor(count: number, dates: LocalDate[]) {
    super('out_of_range_items', `${count} schedule item(s) fall outside the new trip dates`);
    this.count = count;
    this.dates = dates;
  }
}

/** The companion paid for something, is in an amount split or a settlement. See `usage`. */
export class CompanionInUseError extends RepositoryError {
  readonly usage: CompanionUsage;

  constructor(usage: CompanionUsage) {
    super('companion_in_use', 'companion is still used by expenses or settlements');
    this.usage = usage;
  }
}

/** The settlement currency can't change once the trip has expenses or settlements. */
export class CurrencyLockedError extends RepositoryError {
  constructor() {
    super('currency_locked', 'settlement currency is locked by existing expenses or settlements');
  }
}

export class InvalidSplitError extends RepositoryError {
  readonly detail: SplitError;

  constructor(detail: SplitError) {
    super('invalid_split', `invalid split: ${detail.kind}`);
    this.detail = detail;
  }
}

export class BackupFormatError extends RepositoryError {
  constructor(code: 'backup_invalid' | 'backup_unsupported_version', message: string) {
    super(code, message);
  }
}
