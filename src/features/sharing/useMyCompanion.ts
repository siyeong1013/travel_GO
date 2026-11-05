import type { Companion, ID } from '@/data/models';
import { myCompanion } from '@/data/rules/companion';
import type { TripRole } from '@/data/sharing/sharing';
import { useAccountStore } from '@/features/account/accountStore';
import { useSyncStore } from '@/features/sync/syncStore';

/** The signed-in account (null when signed out) and its part in `tripId` on the server. */
export function useTripAccount(tripId: ID | undefined): {
  accountId: string | null;
  role: TripRole | undefined;
} {
  const accountId = useAccountStore((state) =>
    state.status === 'signedIn' ? (state.account?.id ?? null) : null,
  );
  const role = useSyncStore((state) => (tripId ? state.roles[tripId] : undefined));
  return { accountId, role };
}

/** The person using the app among `companions` of `tripId` (`myCompanion`). */
export function useMyCompanion(tripId: ID, companions: Companion[]): Companion | undefined {
  const { accountId, role } = useTripAccount(tripId);
  return myCompanion(companions, accountId, role);
}
