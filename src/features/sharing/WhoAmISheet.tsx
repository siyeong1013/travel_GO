import { type FormEvent, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import type { Companion, ID } from '@/data/models';
import { COMPANION_NAME_MAX_LENGTH, isCompanionNameTaken } from '@/data/rules/companion';
import type { Account } from '@/features/account/account';
import { useExpenseStore } from '@/features/expenses/expenseStore';
import { errorMessage } from '@/lib/errorMessage';
import { josa } from '@/lib/format';

interface WhoAmISheetProps {
  tripId: ID;
  companions: Companion[];
  account: Account;
  /** After they picked (or added) themselves. */
  onDone: () => void;
  onClose: () => void;
}

/**
 * "가계부에서 누가 나예요?": links a companion of the trip to the account, or adds one for it. Then
 * new expenses start with them paying, and the companion sheet marks them as "나".
 */
export function WhoAmISheet({ tripId, companions, account, onDone, onClose }: WhoAmISheetProps) {
  const claimCompanion = useExpenseStore((state) => state.claimCompanion);
  const addCompanion = useExpenseStore((state) => state.addCompanion);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(account.name);
  const [nameError, setNameError] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Another account's companion is theirs.
  const choices = companions.filter((c) => c.accountId === null || c.accountId === account.id);
  const others = companions.filter((c) => c.accountId !== null && c.accountId !== account.id);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onDone();
    } catch (err) {
      console.error(err);
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  function handleAdd(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setNameError('이름을 입력해 주세요.');
    if (isCompanionNameTaken(trimmed, companions)) {
      return setNameError('이미 있는 이름이에요. 목록에서 고르거나 다른 이름을 써 주세요.');
    }
    void run(() => addCompanion({ tripId, name: trimmed, accountId: account.id }));
  }

  return (
    <BottomSheet open onClose={busy ? () => {} : onClose} title="가계부에서 누가 나예요?">
      <div className="px-3 pb-2">
        <p className="-mt-1 text-sm break-keep text-gray-500">
          고르면 지출을 기록할 때 내가 낸 것으로 먼저 정해져요.
        </p>
        <ul className="mt-2 divide-y divide-gray-100">
          {choices.map((companion) => (
            <li key={companion.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => claimCompanion(companion.id, account.id))}
                className="flex min-h-14 w-full items-center gap-2 rounded-lg px-1 text-left text-base font-medium active:bg-gray-50"
              >
                <span className="min-w-0 flex-1 truncate">{companion.name}</span>
                {companion.accountId === account.id && (
                  <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-600">
                    나
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {others.length > 0 && (
          <p className="mt-2 text-sm break-keep text-gray-400">
            {josa(others.map((c) => c.name).join(', '), '은/는')} 다른 사람이에요.
          </p>
        )}
        {adding ? (
          <form noValidate onSubmit={handleAdd} className="mt-3 flex flex-col gap-2">
            <TextField
              label="내 이름"
              name="myName"
              value={name}
              maxLength={COMPANION_NAME_MAX_LENGTH}
              autoComplete="off"
              enterKeyHint="done"
              error={nameError}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(undefined);
              }}
            />
            <Button type="submit" block disabled={busy}>
              추가하고 나로 정하기
            </Button>
          </form>
        ) : (
          <Button variant="secondary" block className="mt-3" onClick={() => setAdding(true)}>
            목록에 없어요
          </Button>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-500">
            {error}
          </p>
        )}
      </div>
    </BottomSheet>
  );
}
