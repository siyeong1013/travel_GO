import type { ID, ISODateTime, LocalDate } from '@/data/models';

// Sharing a trip with friends (step 18): the owner's invite link, joining through it, and who is
// in a trip. Server-only, unlike the trips themselves: these calls need a connection
// (supabase/migrations/*_sharing.sql).

/** An account's part in a trip on the server: `owner` made it (and alone deletes it or invites). */
export type TripRole = 'owner' | 'member';

/** A trip's invite link: `/join/<token>`. */
export interface Invite {
  token: string;
  expiresAt: ISODateTime;
}

/** What an invite link is for, shown before joining (also signed out). */
export interface InvitePreview {
  tripId: ID;
  title: string;
  city: string | null;
  startDate: LocalDate;
  endDate: LocalDate;
  /** The owner's name as their login has it. */
  inviter: string | null;
  expiresAt: ISODateTime;
}

/** Someone in a trip, as their login shows them. */
export interface TripPerson {
  userId: string;
  role: TripRole;
  name: string | null;
  avatarUrl: string | null;
  joinedAt: ISODateTime;
}

export interface JoinResult {
  tripId: ID;
  role: TripRole;
  /** False when the account was in the trip already. */
  joined: boolean;
}

/** Why the server didn't: the trip isn't on it yet, was deleted, or isn't this account's to manage. */
export type SharingRefusal = 'no_trip' | 'gone' | 'forbidden';

export class SharingRefusedError extends Error {
  readonly reason: SharingRefusal;

  constructor(reason: SharingRefusal) {
    super(`the server refused: ${reason}`);
    this.name = 'SharingRefusedError';
    this.reason = reason;
  }
}

/** The server's sharing calls, as the signed-in account (or a visitor, for `preview`). */
export interface SharingServer {
  /** The trip's link, made now unless it has one that still works. Owner only. */
  createInvite: (tripId: ID) => Promise<Invite>;
  /** The trip's link if it still works. Owner only. */
  currentInvite: (tripId: ID) => Promise<Invite | null>;
  /** Cuts the trip's link: nobody else joins through it. Owner only. */
  revokeInvite: (tripId: ID) => Promise<void>;
  /** What the link is for; null when it doesn't work (cut, expired, its trip deleted). */
  preview: (token: string) => Promise<InvitePreview | null>;
  /** Joins the link's trip; null when the link doesn't work. */
  join: (token: string) => Promise<JoinResult | null>;
  /** Who is in the trip, the owner first. Members only. */
  people: (tripId: ID) => Promise<TripPerson[]>;
  /** Leaves the trip. Not its owner, who deletes it instead. */
  leave: (tripId: ID) => Promise<void>;
  /** Takes someone out of the trip. Owner only. */
  removeMember: (tripId: ID, userId: string) => Promise<void>;
}

/** Calls the server function `fn` with named arguments; resolves to what it returned. */
export type ServerCall = (fn: string, args: Record<string, string>) => Promise<unknown>;

interface Answer {
  status: string;
  [key: string]: unknown;
}

const iso = (value: unknown) => new Date(String(value)).toISOString();

/** The sharing calls over `call` (Supabase's `rpc`, or a test database). */
export function createSharingServer(call: ServerCall): SharingServer {
  async function ask(fn: string, args: Record<string, string>): Promise<Answer> {
    const answer = (await call(fn, args)) as Answer;
    const { status } = answer;
    if (status === 'no_trip' || status === 'gone' || status === 'forbidden') {
      throw new SharingRefusedError(status);
    }
    return answer;
  }

  const invite = (answer: Answer): Invite => ({
    token: String(answer.token),
    expiresAt: iso(answer.expiresAt),
  });

  return {
    async createInvite(tripId) {
      return invite(await ask('create_invite', { trip: tripId }));
    },

    async currentInvite(tripId) {
      const answer = await ask('current_invite', { trip: tripId });
      return answer.status === 'ok' ? invite(answer) : null;
    },

    async revokeInvite(tripId) {
      await ask('revoke_invite', { trip: tripId });
    },

    async preview(token) {
      const answer = await ask('invite_preview', { token });
      if (answer.status !== 'ok') return null;
      return {
        tripId: String(answer.tripId),
        title: String(answer.title ?? ''),
        city: typeof answer.city === 'string' && answer.city ? answer.city : null,
        startDate: String(answer.startDate),
        endDate: String(answer.endDate),
        inviter: typeof answer.inviter === 'string' ? answer.inviter : null,
        expiresAt: iso(answer.expiresAt),
      };
    },

    async join(token) {
      const answer = await ask('join_trip', { token });
      if (answer.status !== 'joined' && answer.status !== 'member') return null;
      return {
        tripId: String(answer.tripId),
        role: answer.role === 'owner' ? 'owner' : 'member',
        joined: answer.status === 'joined',
      };
    },

    async people(tripId) {
      const answer = await ask('trip_people', { trip: tripId });
      return (answer.people as Record<string, unknown>[]).map((person) => ({
        userId: String(person.userId),
        role: person.role === 'owner' ? 'owner' : 'member',
        name: typeof person.name === 'string' ? person.name : null,
        avatarUrl: typeof person.avatarUrl === 'string' ? person.avatarUrl : null,
        joinedAt: iso(person.joinedAt),
      }));
    },

    async leave(tripId) {
      await ask('leave_trip', { trip: tripId });
    },

    async removeMember(tripId, userId) {
      await ask('remove_member', { trip: tripId, member: userId });
    },
  };
}
