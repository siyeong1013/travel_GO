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
    order: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
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
