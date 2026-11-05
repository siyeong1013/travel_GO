import type { Companion, ID } from '@/data/models';

export interface NewCompanion {
  tripId: ID;
  name: string;
  /** Whose companion this is, as with `claim`. */
  accountId?: string | null;
}

/** What deleting a companion would touch. */
export interface CompanionUsage {
  /**
   * Expenses that prevent deleting: paid by them, split by amount with them, or that would be
   * left with no participant without them.
   */
  blockingExpenseIds: ID[];
  /** Settlements they sent or received (also prevent deleting). */
  settlementIds: ID[];
  /** Equal/ratio expenses they would be taken out of, re-splitting among the rest. */
  resplitExpenseIds: ID[];
}

export interface CompanionRepository {
  /** In `order`; "나" first. */
  listByTrip(tripId: ID): Promise<Companion[]>;
  /** Added last. Names are trimmed and must be unique within the trip. */
  create(input: NewCompanion): Promise<Companion>;
  rename(id: ID, name: string): Promise<Companion>;
  /**
   * Makes them `accountId`'s companion: the person of that account, in a trip shared with friends.
   * The account's other companion in the trip (a wrong pick) lets go. `ValidationError` when they
   * are another account's.
   */
  claim(id: ID, accountId: string): Promise<Companion>;
  usage(id: ID): Promise<CompanionUsage>;
  /**
   * Takes them out of equal/ratio splits (re-splitting) and deletes them. Throws
   * `CompanionInUseError` when `usage` has blocking expenses or settlements, and
   * `ValidationError` for "나". No-op if they don't exist.
   */
  delete(id: ID): Promise<void>;
}
