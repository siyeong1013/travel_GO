import type { Companion, ID, ISODateTime } from '@/data/models';
import { ValidationError } from '@/data/repositories';
import { derivedId } from '@/lib/id';

export const ME_NAME = '나';
export const COMPANION_NAME_MAX_LENGTH = 20;

/** The same id for a trip's "나" everywhere: new trips, the DB migration, v1 backup imports. */
export const meCompanionId = (tripId: ID): ID => derivedId(`companion:me:${tripId}`);

export function makeMeCompanion(tripId: ID, timestamp: ISODateTime): Companion {
  return {
    id: meCompanionId(tripId),
    tripId,
    name: ME_NAME,
    isMe: true,
    accountId: null,
    order: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Who the person using the app is among a trip's companions: the one linked to their account, or
 * else "나" in a trip they own (or that isn't shared). A friend who joined the trip has none until
 * they pick one. `role`: their part in the trip on the server, if it is there.
 */
export function myCompanion(
  companions: Companion[],
  accountId: string | null,
  role: 'owner' | 'member' | undefined,
): Companion | undefined {
  const linked = accountId === null ? undefined : companions.find((c) => c.accountId === accountId);
  if (linked || role === 'member') return linked;
  return companions.find((c) => c.isMe && (c.accountId === null || c.accountId === accountId));
}

const nameKey = (name: string) => name.trim().toLocaleLowerCase('ko-KR');

export function isCompanionNameTaken(name: string, others: Pick<Companion, 'name'>[]): boolean {
  return others.some((other) => nameKey(other.name) === nameKey(name));
}

/** Trimmed name. Throws `ValidationError` when empty, too long, or used by one of `others`. */
export function cleanCompanionName(name: string, others: Pick<Companion, 'name'>[]): string {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError('companion name is required');
  if (trimmed.length > COMPANION_NAME_MAX_LENGTH) throw new ValidationError('companion name is too long');
  if (isCompanionNameTaken(trimmed, others)) throw new ValidationError('companion name is taken');
  return trimmed;
}
