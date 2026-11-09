import type { ExpenseShare, ID, SplitMethod } from '@/data/models';

export interface SplitParticipant {
  companionId: ID;
  /** Weight (positive integer) for `ratio`; minor-unit amount for `amount`; ignored for `equal`. */
  value: number | null;
}

export interface ShareDraft {
  companionId: ID;
  weight: number | null;
  amount: number;
}

export type SplitError =
  | { kind: 'no_participants' }
  | { kind: 'duplicate_participant'; companionId: ID }
  | { kind: 'invalid_weight'; companionId: ID }
  | { kind: 'invalid_share_amount'; companionId: ID }
  /** Entered amounts don't add up: `difference` = total − sum (positive means short). */
  | { kind: 'sum_mismatch'; difference: number };

export type SplitResult = { ok: true; shares: ShareDraft[] } | { ok: false; error: SplitError };

export const MAX_WEIGHT = 1000;

const fail = (error: SplitError): SplitResult => ({ ok: false, error });

/**
 * Who carries what doesn't divide evenly: the first payer who shares the expense, else the first
 * payer (with a share of the remainder alone), else, while nobody is ticked as paying yet (a form
 * being filled in), the first person sharing it.
 */
export function remainderHolder(payerIds: readonly ID[], sharing: readonly ID[]): ID | undefined {
  return payerIds.find((id) => sharing.includes(id)) ?? payerIds[0] ?? sharing[0];
}

/**
 * Splits `amount` among `participants`. Equal is ratio with every weight 1. What doesn't divide
 * evenly goes to `remainderHolder`: a payer, who gets a weight-0 share for it when not a
 * participant. The shares always add up to `amount`.
 */
export function splitExpense(
  amount: number,
  payerIds: readonly ID[],
  method: SplitMethod,
  participants: SplitParticipant[],
): SplitResult {
  if (participants.length === 0) return fail({ kind: 'no_participants' });
  const seen = new Set<ID>();
  for (const { companionId } of participants) {
    if (seen.has(companionId)) return fail({ kind: 'duplicate_participant', companionId });
    seen.add(companionId);
  }

  if (method === 'amount') {
    let sum = 0;
    for (const { companionId, value } of participants) {
      if (!Number.isSafeInteger(value) || value! < 0) {
        return fail({ kind: 'invalid_share_amount', companionId });
      }
      sum += value!;
    }
    if (sum !== amount) return fail({ kind: 'sum_mismatch', difference: amount - sum });
    return {
      ok: true,
      shares: participants.map(({ companionId, value }) => ({
        companionId,
        weight: null,
        amount: value!,
      })),
    };
  }

  const weights: number[] = [];
  for (const { companionId, value } of participants) {
    const weight = method === 'equal' ? 1 : value;
    if (!Number.isInteger(weight) || weight! < 1 || weight! > MAX_WEIGHT) {
      return fail({ kind: 'invalid_weight', companionId });
    }
    weights.push(weight!);
  }
  const totalWeight = BigInt(weights.reduce((a, b) => a + b, 0));
  const shares: ShareDraft[] = participants.map(({ companionId }, i) => ({
    companionId,
    weight: weights[i]!,
    amount: Number((BigInt(amount) * BigInt(weights[i]!)) / totalWeight),
  }));

  const remainder = amount - shares.reduce((sum, share) => sum + share.amount, 0);
  if (remainder > 0) {
    const holder = remainderHolder(payerIds, [...seen])!;
    const share = shares.find((s) => s.companionId === holder);
    if (share) share.amount += remainder;
    else shares.push({ companionId: holder, weight: 0, amount: remainder });
  }
  return { ok: true, shares };
}

/** The participants (and entered values) behind stored shares, for editing an expense. */
export function participantsFromShares(
  method: SplitMethod,
  shares: Pick<ExpenseShare, 'companionId' | 'weight' | 'amount'>[],
): SplitParticipant[] {
  return shares
    .filter((share) => share.weight !== 0)
    .map(({ companionId, weight, amount }) => ({
      companionId,
      value: method === 'equal' ? null : method === 'ratio' ? weight : amount,
    }));
}
