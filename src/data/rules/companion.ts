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

/** A friend's companion when their login has no name. */
const FRIEND_NAME = '친구';

/**
 * A companion name from a login's (`name`, empty when it has none): cut to the limit, and
 * numbered when one of `others` has it (`민수 2`).
 */
export function companionNameFor(name: string, others: Pick<Companion, 'name'>[]): string {
  const base = name.trim().slice(0, COMPANION_NAME_MAX_LENGTH) || FRIEND_NAME;
  if (!isCompanionNameTaken(base, others)) return base;
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const kept = base.slice(0, COMPANION_NAME_MAX_LENGTH - suffix.length).trimEnd();
    const numbered = `${kept}${suffix}`;
    if (!isCompanionNameTaken(numbered, others)) return numbered;
  }
}

/** The companion added for an account in a trip it joined: the same on each of its devices. */
export const accountCompanionId = (tripId: ID, accountId: string): ID =>
  derivedId(`companion:account:${tripId}:${accountId}`);

/** What `myCompanionStep` asks for. `name`: what the companion is to be called, if renamed. */
export type MyCompanionStep =
  | { kind: 'claim'; id: ID; name: string | null }
  | { kind: 'rename'; id: ID; name: string }
  /** Added as `accountCompanionId`. */
  | { kind: 'add'; name: string }
  /** Others in the ledger might be them: they pick (or add themselves). */
  | { kind: 'ask' };

/**
 * What puts the signed-in account in a trip's ledger under its login's name, so everyone there
 * shows by name and nobody adds the people of a shared trip by hand. Null: nothing to do.
 * - In a trip of theirs (`role` not `member`), "나" becomes theirs, renamed while still "나".
 * - In a trip they joined: the companion with their name becomes theirs, else they are added,
 *   unless others not yet anyone's might be them (`ask`). Never the owner's "나".
 * `account.name` is empty when the login has no name: "나" stays.
 */
export function myCompanionStep(
  companions: Companion[],
  account: { id: string; name: string },
  role: 'owner' | 'member' | undefined,
): MyCompanionStep | null {
  const linked = companions.find((c) => c.accountId === account.id);
  if (role !== 'member') {
    const me = linked ?? companions.find((c) => c.isMe && c.accountId === null);
    if (!me) return null;
    const others = companions.filter((c) => c.id !== me.id);
    const name =
      me.name === ME_NAME && account.name.trim() ? companionNameFor(account.name, others) : null;
    if (me.accountId !== account.id) return { kind: 'claim', id: me.id, name };
    return name ? { kind: 'rename', id: me.id, name } : null;
  }
  if (linked) return null;
  const open = companions.filter((c) => c.accountId === null && !c.isMe);
  const named = open.find((c) => nameKey(c.name) === nameKey(account.name));
  if (named) return { kind: 'claim', id: named.id, name: null };
  if (open.length > 0) return { kind: 'ask' };
  return { kind: 'add', name: companionNameFor(account.name, companions) };
}

/** Trimmed name. Throws `ValidationError` when empty, too long, or used by one of `others`. */
export function cleanCompanionName(name: string, others: Pick<Companion, 'name'>[]): string {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError('companion name is required');
  if (trimmed.length > COMPANION_NAME_MAX_LENGTH) throw new ValidationError('companion name is too long');
  if (isCompanionNameTaken(trimmed, others)) throw new ValidationError('companion name is taken');
  return trimmed;
}
