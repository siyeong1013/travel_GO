import { type FormEvent, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { iconButtonClass } from '@/components/ui/buttonClass';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { TextField } from '@/components/ui/Field';
import { PencilIcon, TrashIcon } from '@/components/ui/icons';
import type { Companion, ExpenseWithShares, ID } from '@/data/models';
import type { CompanionUsage } from '@/data/repositories';
import {
  COMPANION_NAME_MAX_LENGTH,
  isCompanionNameTaken,
  ME_NAME,
} from '@/data/rules/companion';
import {
  BLOCK_REASON_LABELS,
  blockReason,
  expenseTitle,
} from '@/features/expenses/expenseDisplay';
import { useExpenseStore } from '@/features/expenses/expenseStore';
import { errorMessage } from '@/lib/errorMessage';
import { formatDate, formatMoney, josa } from '@/lib/format';

interface CompanionSheetProps {
  tripId: ID;
  companions: Companion[];
  expenses: ExpenseWithShares[];
  /** Opens an expense that keeps someone from being deleted, to fix it. */
  onOpenExpense: (id: ID) => void;
  onClose: () => void;
}

type Pending =
  | { kind: 'rename'; companion: Companion }
  | { kind: 'delete'; companion: Companion; usage: CompanionUsage };

/** Who is on the trip: add, rename, delete (with what it would touch). */
export function CompanionSheet({
  tripId,
  companions,
  expenses,
  onOpenExpense,
  onClose,
}: CompanionSheetProps) {
  const addCompanion = useExpenseStore((state) => state.addCompanion);
  const companionUsage = useExpenseStore((state) => state.companionUsage);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      console.error(err);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function handleAdd(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setNameError('이름을 입력해 주세요.');
    if (isCompanionNameTaken(trimmed, companions)) return setNameError('이미 있는 이름이에요.');
    void run(async () => {
      await addCompanion({ tripId, name: trimmed });
      setName('');
    });
  }

  return (
    <>
      <BottomSheet open onClose={onClose} title="동행자">
        <div className="px-3 pb-2">
          <p className="-mt-1 text-sm text-gray-500">지출을 함께 나눌 사람이에요. 이름만 있으면 돼요.</p>
          <ul className="mt-2 divide-y divide-gray-100">
            {companions.map((companion) => (
              <li key={companion.id} className="flex min-h-14 items-center gap-1">
                <span className="min-w-0 truncate text-base font-medium">{companion.name}</span>
                {/* Marks "나" once renamed, e.g. 시영 (나). */}
                {companion.isMe && companion.name !== ME_NAME && (
                  <span className="ml-1 shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-600">
                    나
                  </span>
                )}
                <span className="flex-1" />
                <button
                  type="button"
                  aria-label={`${companion.name} 이름 바꾸기`}
                  className={iconButtonClass}
                  disabled={busy}
                  onClick={() => setPending({ kind: 'rename', companion })}
                >
                  <PencilIcon width={20} height={20} />
                </button>
                {/* "나" can't be deleted; the gap keeps the pencils lined up. */}
                {companion.isMe && <span className="size-11 shrink-0" />}
                {!companion.isMe && (
                  <button
                    type="button"
                    aria-label={`${companion.name} 삭제`}
                    className={`${iconButtonClass} text-red-500`}
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const usage = await companionUsage(companion.id);
                        setPending({ kind: 'delete', companion, usage });
                      })
                    }
                  >
                    <TrashIcon width={20} height={20} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <form noValidate onSubmit={handleAdd} className="mt-3 flex items-start gap-2">
            <TextField
              label="새 동행자"
              name="companionName"
              className="flex-1"
              placeholder="이름"
              autoComplete="off"
              enterKeyHint="done"
              maxLength={COMPANION_NAME_MAX_LENGTH}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(undefined);
              }}
              error={nameError}
            />
            {/* Lines up with the input under the label row (20px + 6px gap). */}
            <Button type="submit" className="mt-[26px] shrink-0" disabled={busy}>
              추가
            </Button>
          </form>
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-500">
              {error}
            </p>
          )}
          <Button variant="secondary" block className="mt-5" onClick={onClose}>
            완료
          </Button>
        </div>
      </BottomSheet>

      {pending?.kind === 'rename' && (
        <RenameSheet
          companion={pending.companion}
          others={companions.filter((c) => c.id !== pending.companion.id)}
          onClose={() => setPending(null)}
        />
      )}
      {pending?.kind === 'delete' && (
        <DeleteSheet
          companion={pending.companion}
          usage={pending.usage}
          expenses={expenses}
          onOpenExpense={onOpenExpense}
          onClose={() => setPending(null)}
        />
      )}
    </>
  );
}

interface RenameSheetProps {
  companion: Companion;
  others: Companion[];
  onClose: () => void;
}

function RenameSheet({ companion, others, onClose }: RenameSheetProps) {
  const rename = useExpenseStore((state) => state.renameCompanion);
  const [name, setName] = useState(companion.name);
  const [nameError, setNameError] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setNameError('이름을 입력해 주세요.');
    if (isCompanionNameTaken(trimmed, others)) return setNameError('이미 있는 이름이에요.');
    if (trimmed === companion.name) return onClose();
    setSaving(true);
    setError(null);
    try {
      await rename(companion.id, trimmed);
      onClose();
    } catch (err) {
      console.error(err);
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <BottomSheet open onClose={onClose} title="이름 바꾸기">
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 px-3 pb-2">
        <TextField
          label="이름"
          name="companionName"
          autoComplete="off"
          enterKeyHint="done"
          maxLength={COMPANION_NAME_MAX_LENGTH}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameError(undefined);
          }}
          error={nameError}
        />
        {error && (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}
        <Button type="submit" block disabled={saving}>
          저장
        </Button>
      </form>
    </BottomSheet>
  );
}

interface DeleteSheetProps {
  companion: Companion;
  usage: CompanionUsage;
  expenses: ExpenseWithShares[];
  onOpenExpense: (id: ID) => void;
  onClose: () => void;
}

/** Refuses with the expenses to fix first, or confirms (saying what gets re-split). */
function DeleteSheet({ companion, usage, expenses, onOpenExpense, onClose }: DeleteSheetProps) {
  const remove = useExpenseStore((state) => state.removeCompanion);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const blocking = expenses.filter((e) => usage.blockingExpenseIds.includes(e.id));
  const resplit = usage.resplitExpenseIds.length;

  if (blocking.length > 0 || usage.settlementIds.length > 0) {
    return (
      <BottomSheet open onClose={onClose} title={`${josa(companion.name, '을/를')} 삭제할 수 없어요`}>
        <div className="px-3 pb-2">
          <p className="text-sm leading-relaxed text-gray-600">
            {blocking.length > 0
              ? `${josa(companion.name, '이/가')} 결제했거나 꼭 들어가야 하는 지출이 있어요. 결제자나 나눌 사람을 바꾼 뒤 다시 시도해 주세요.`
              : `${companion.name} 님의 송금 완료 기록이 있어요. 정산 화면에서 송금 완료 표시를 취소한 뒤 다시 시도해 주세요.`}
          </p>
          {blocking.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1">
              {blocking.map((expense) => (
                <li key={expense.id}>
                  <button
                    type="button"
                    onClick={() => onOpenExpense(expense.id)}
                    className="flex w-full items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5 text-left active:bg-gray-100"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{expenseTitle(expense)}</span>
                      <span className="block text-sm text-gray-500">
                        {formatDate(expense.date)} · {BLOCK_REASON_LABELS[blockReason(expense, companion.id)]}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {formatMoney(expense.amount, expense.currency)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {blocking.length > 0 && usage.settlementIds.length > 0 && (
            <p className="mt-3 text-sm text-gray-600">
              송금 완료 기록도 {usage.settlementIds.length}건 있어요. 정산 화면에서 취소할 수 있어요.
            </p>
          )}
          <Button variant="secondary" block className="mt-5" onClick={onClose}>
            닫기
          </Button>
        </div>
      </BottomSheet>
    );
  }

  return (
    <ConfirmSheet
      open
      title={`${josa(companion.name, '을/를')} 삭제할까요?`}
      description={
        resplit > 0
          ? `${josa(companion.name, '이/가')} 함께 나눈 지출 ${resplit}건은 남은 사람끼리 다시 나눠요.`
          : undefined
      }
      confirmLabel={resplit > 0 ? '빼고 다시 나누기' : '삭제'}
      tone="danger"
      busy={busy}
      error={error}
      onConfirm={() => {
        setBusy(true);
        setError(null);
        remove(companion.id).then(onClose, (err: unknown) => {
          console.error(err);
          setError(errorMessage(err));
          setBusy(false);
        });
      }}
      onClose={onClose}
    />
  );
}
