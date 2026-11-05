import { useEffect, useRef } from 'react';
import type { Companion, ID } from '@/data/models';
import {
  accountCompanionId,
  type MyCompanionStep,
  myCompanion,
  myCompanionStep,
} from '@/data/rules/companion';
import type { TripRole } from '@/data/sharing/sharing';
import { type Account, NO_NAME } from '@/features/account/account';
import { useAccountStore } from '@/features/account/accountStore';
import { expenseStore, useExpenseStore } from '@/features/expenses/expenseStore';
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

/** The account as `myCompanionStep` takes it: no name when its login has none. */
export function ledgerAccount(account: Account): { id: string; name: string } {
  return { id: account.id, name: account.name === NO_NAME ? '' : account.name };
}

/** Does `step` in the ledger of `tripId` (held by the expense store). */
export async function applyMyCompanionStep(tripId: ID, accountId: string, step: MyCompanionStep) {
  const ledger = expenseStore.getState();
  if (step.kind === 'claim') {
    await ledger.claimCompanion(step.id, accountId);
    if (step.name) await ledger.renameCompanion(step.id, step.name);
  } else if (step.kind === 'rename') {
    await ledger.renameCompanion(step.id, step.name);
  } else if (step.kind === 'add') {
    await ledger.addCompanion(
      { tripId, name: step.name, accountId },
      { id: accountCompanionId(tripId, accountId) },
    );
  }
}

/**
 * Puts the signed-in account in `tripId`'s ledger under its login's name (`myCompanionStep`),
 * once the ledger and the account's trips are known: "나" takes their name in their own trips, and
 * a friend who joined is added. When others might be them, joining (or the people screen) asks.
 */
export function useAccountInLedger(tripId: ID | undefined) {
  const account = useAccountStore((state) => (state.status === 'signedIn' ? state.account : null));
  // Before the roles are read, a trip shared with them would look like one of theirs.
  const rolesKnown = useSyncStore((state) => account !== null && state.rolesOf === account.id);
  const role = useSyncStore((state) => (tripId ? state.roles[tripId] : undefined));
  const ledgerTripId = useExpenseStore((state) => state.tripId);
  const ready = useExpenseStore((state) => state.status === 'ready');
  const companions = useExpenseStore((state) => state.companions);
  const busy = useRef(false);

  useEffect(() => {
    if (!tripId || !account || !rolesKnown || ledgerTripId !== tripId || !ready) return;
    if (busy.current) return;
    const step = myCompanionStep(companions, ledgerAccount(account), role);
    if (!step || step.kind === 'ask') return;
    busy.current = true;
    applyMyCompanionStep(tripId, account.id, step)
      .catch((error: unknown) => console.error(error))
      .finally(() => {
        busy.current = false;
      });
  }, [tripId, account, rolesKnown, role, ledgerTripId, ready, companions]);
}
