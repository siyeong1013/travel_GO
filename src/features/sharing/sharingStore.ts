import { createStore, type StoreApi, useStore } from 'zustand';
import { connectSharing } from '@/data';
import type { ID } from '@/data/models';
import type { Invite, SharingServer, TripPerson } from '@/data/sharing/sharing';
import { type AccountState, accountStore } from '@/features/account/accountStore';
import { type SyncState, syncStore } from '@/features/sync/syncStore';

/** `offline` / `error`: who is in the trip couldn't be read (no connection, or the server failed). */
export type SharingStatus = 'idle' | 'loading' | 'ready' | 'offline' | 'error';

export interface SharingState {
  tripId: ID | null;
  status: SharingStatus;
  /** Who is in the trip on the server, the owner first. Empty while it isn't uploaded. */
  people: TripPerson[];
  /** The trip's working invite link, for its owner. */
  invite: Invite | null;
  /** Reads who is in `tripId` and, for its owner, the link. */
  load: (tripId: ID) => Promise<void>;
  /** The trip's link, made now unless it has one. A trip not on the server yet goes up first. */
  createInvite: (tripId: ID) => Promise<Invite>;
  /** Cuts the link: nobody else joins through it. */
  revokeInvite: (tripId: ID) => Promise<void>;
  /** The owner takes someone out of the trip. */
  removeMember: (tripId: ID, userId: string) => Promise<void>;
  /** A member leaves the trip: off its list on the server, then off this device. */
  leave: (tripId: ID) => Promise<void>;
}

/** Inviting needs the trip on the server, and it couldn't go up (no connection). */
export class NotUploadedError extends Error {
  constructor() {
    super('the trip is not on the server yet');
    this.name = 'NotUploadedError';
  }
}

interface SharingStoreOptions {
  connect: (userId: string | null) => Promise<SharingServer>;
  account: StoreApi<AccountState>;
  sync: StoreApi<SyncState>;
}

const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;

export function createSharingStore({ connect, account, sync }: SharingStoreOptions) {
  function signedIn(): string {
    const { status, account: who } = account.getState();
    if (status !== 'signedIn' || !who) throw new Error('sign in to share a trip');
    return who.id;
  }

  return createStore<SharingState>()((set, get) => {
    const server = () => connect(signedIn());

    return {
      tripId: null,
      status: 'idle',
      people: [],
      invite: null,

      async load(tripId) {
        if (get().tripId !== tripId) set({ tripId, people: [], invite: null });
        const role = sync.getState().roles[tripId];
        // Not uploaded yet (or signed out): nobody else is in it.
        if (!role || account.getState().status !== 'signedIn') {
          set({ status: 'ready', people: [], invite: null });
          return;
        }
        if (!online()) {
          set({ status: 'offline' });
          return;
        }
        set({ status: 'loading' });
        try {
          const calls = await server();
          const [people, invite] = await Promise.all([
            calls.people(tripId),
            role === 'owner' ? calls.currentInvite(tripId) : null,
          ]);
          if (get().tripId === tripId) set({ status: 'ready', people, invite });
        } catch (error) {
          console.error(error);
          if (get().tripId === tripId) set({ status: online() ? 'error' : 'offline' });
          // Taken out of the trip, say: the next sync takes it off the device.
          void sync.getState().syncNow();
        }
      },

      async createInvite(tripId) {
        if (!sync.getState().roles[tripId]) await sync.getState().syncNow();
        if (!sync.getState().roles[tripId]) throw new NotUploadedError();
        const invite = await (await server()).createInvite(tripId);
        if (get().tripId === tripId) set({ invite });
        return invite;
      },

      async revokeInvite(tripId) {
        await (await server()).revokeInvite(tripId);
        if (get().tripId === tripId) set({ invite: null });
      },

      async removeMember(tripId, userId) {
        await (await server()).removeMember(tripId, userId);
        if (get().tripId === tripId) {
          set({ people: get().people.filter((person) => person.userId !== userId) });
        }
      },

      async leave(tripId) {
        await (await server()).leave(tripId);
        await sync.getState().forgetTrip(tripId);
        if (get().tripId === tripId) set({ people: [], invite: null });
      },
    };
  });
}

export const sharingStore = createSharingStore({
  connect: connectSharing,
  account: accountStore,
  sync: syncStore,
});

export function useSharingStore<T>(selector: (state: SharingState) => T): T {
  return useStore(sharingStore, selector);
}
