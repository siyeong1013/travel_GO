import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { CheckIcon, ShareIcon } from '@/components/ui/icons';
import { PageSection } from '@/components/ui/PageSection';
import { Snackbar } from '@/components/ui/Snackbar';
import type { Companion, ExpenseWithShares, ID, Settlement, Trip } from '@/data/models';
import { buildLedger } from '@/data/rules/ledger';
import { planTransfers, type Transfer } from '@/data/rules/settlementPlan';
import { useExpenseStore } from '@/features/expenses/expenseStore';
import { CopyTextSheet } from '@/features/settlement/CopyTextSheet';
import {
  balanceText,
  nameOf,
  orderTransfers,
  settlementText,
  transferLabel,
} from '@/features/settlement/settlementDisplay';
import { errorMessage } from '@/lib/errorMessage';
import { formatDateTime, formatMoney, josa } from '@/lib/format';
import { canShare, copyText, shareText } from '@/lib/share';

interface SettlementViewProps {
  trip: Trip;
  companions: Companion[];
  expenses: ExpenseWithShares[];
  settlements: Settlement[];
}

interface Notice {
  id: number;
  message: string;
  undo?: () => Promise<void>;
}

/**
 * Who gets or sends how much, the fewest transfers that even it out (checked off once sent),
 * and the result as text to share.
 */
export function SettlementView({ trip, companions, expenses, settlements }: SettlementViewProps) {
  const addSettlement = useExpenseStore((state) => state.addSettlement);
  const removeSettlement = useExpenseStore((state) => state.removeSettlement);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [manualCopy, setManualCopy] = useState<string | null>(null);
  const [shareable] = useState(canShare);
  const noticeCount = useRef(0);

  if (companions.length < 2) {
    return (
      <EmptyState
        title="함께 정산할 사람이 없어요"
        description="가계부 탭의 동행자 관리에서 동행자를 추가하면 누가 누구에게 얼마를 보내면 되는지 알려 드려요."
      />
    );
  }
  if (expenses.length === 0 && settlements.length === 0) {
    return (
      <EmptyState
        title="아직 정산할 지출이 없어요"
        description="함께 쓴 돈을 기록하면 여기서 정산할 수 있어요."
      />
    );
  }

  const ledger = buildLedger(trip, companions, expenses, settlements);
  const currency = ledger.currency;
  const transfers = orderTransfers(planTransfers(ledger.balances), companions);
  const name = (id: ID) => nameOf(companions, id);
  const text = () => settlementText({ trip, companions, ledger, transfers, settlements });

  function notify(message: string, undo?: () => Promise<void>) {
    noticeCount.current += 1;
    setNotice({ id: noticeCount.current, message, undo });
  }

  /** One write at a time (the checkboxes wait); a failure is shown above the buttons. */
  async function run(write: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await write();
    } catch (err) {
      console.error(err);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function markSent(transfer: Transfer) {
    void run(async () => {
      const created = await addSettlement({ tripId: trip.id, ...transfer });
      const amount = josa(formatMoney(transfer.amount, currency), '을/를');
      notify(
        `${name(transfer.fromId)} → ${name(transfer.toId)} ${amount} 송금 완료로 표시했어요.`,
        () => removeSettlement(created.id),
      );
    });
  }

  function unmark(settlement: Settlement) {
    void run(async () => {
      await removeSettlement(settlement.id);
      const { fromId, toId, amount } = settlement;
      // A record in another currency (merged from a backup) can't be made again as it was.
      const undo =
        settlement.currency === currency
          ? async () => {
              await addSettlement({ tripId: trip.id, fromId, toId, amount });
            }
          : undefined;
      notify('송금 완료 표시를 취소했어요.', undo);
    });
  }

  async function copy() {
    const result = text();
    if (await copyText(result)) notify('정산 결과를 복사했어요. 채팅방에 붙여 넣어 공유하세요.');
    else setManualCopy(result);
  }

  async function share() {
    const result = text();
    if ((await shareText(result)) === 'failed') setManualCopy(result);
  }

  return (
    <>
      <main className="flex flex-1 flex-col">
        {ledger.unconvertible.length > 0 && (
          <p role="note" className="mx-4 mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            환율을 다시 입력해야 하는 지출 {ledger.unconvertible.length}건은 정산에서 빠졌어요.{' '}
            <Link
              to={`/trips/${trip.id}/expenses/summary`}
              className="font-semibold underline underline-offset-2"
            >
              지출 요약에서 고치기
            </Link>
          </p>
        )}

        <PageSection
          title="주고받을 돈"
          description="낸 돈에서 쓴 돈을 빼고, 송금 완료한 돈까지 반영했어요."
        >
          <ul className="-my-2 divide-y divide-gray-100">
            {ledger.balances.map((entry) => (
              <li key={entry.companionId} className="flex min-h-12 items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                  {name(entry.companionId)}
                </span>
                <span
                  className={`shrink-0 tabular-nums ${
                    entry.balance > 0
                      ? 'font-semibold text-brand-600'
                      : entry.balance < 0
                        ? 'font-semibold'
                        : 'text-gray-400'
                  }`}
                >
                  {balanceText(entry.balance, currency)}
                </span>
              </li>
            ))}
          </ul>
        </PageSection>

        <PageSection
          title="송금할 돈"
          description={
            transfers.length > 0
              ? '이대로 보내면 송금 횟수가 가장 적어요. 보냈으면 체크해 두세요.'
              : undefined
          }
        >
          {transfers.length > 0 ? (
            <ul className="-my-2">
              {transfers.map((transfer) => (
                <li key={`${transfer.fromId}>${transfer.toId}`}>
                  <TransferRow
                    from={name(transfer.fromId)}
                    to={name(transfer.toId)}
                    amount={formatMoney(transfer.amount, currency)}
                    label={transferLabel(transfer, companions, currency)}
                    checked={false}
                    disabled={busy}
                    onChange={() => markSent(transfer)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 rounded-xl bg-brand-50 px-4 py-3 text-[15px] font-semibold text-brand-700">
              <CheckIcon width={20} height={20} className="shrink-0" />
              모두 정산했어요.
            </p>
          )}
        </PageSection>

        {settlements.length > 0 && (
          <PageSection
            title="송금 완료"
            description="체크를 풀면 기록이 지워지고, 그 돈은 다시 송금할 돈에 들어가요."
          >
            <ul className="-my-2">
              {settlements.map((settlement) => (
                <li key={settlement.id}>
                  <TransferRow
                    from={name(settlement.fromId)}
                    to={name(settlement.toId)}
                    amount={formatMoney(settlement.amount, settlement.currency)}
                    label={transferLabel(settlement, companions, settlement.currency)}
                    meta={
                      settlement.currency === currency
                        ? `${formatDateTime(settlement.createdAt)} 기록`
                        : `${settlement.currency} 기록이라 잔액에 반영하지 않았어요`
                    }
                    checked
                    disabled={busy}
                    onChange={() => unmark(settlement)}
                  />
                </li>
              ))}
            </ul>
          </PageSection>
        )}
      </main>

      <BottomActionBar>
        {error && (
          <p role="alert" className="mb-2 text-center text-sm text-red-500">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          {shareable && (
            <Button variant="secondary" className="shrink-0 px-4" onClick={() => void share()}>
              <ShareIcon width={20} height={20} />
              공유
            </Button>
          )}
          <Button block onClick={() => void copy()}>
            정산 결과 복사
          </Button>
        </div>
      </BottomActionBar>

      {notice && (
        <Snackbar
          key={notice.id}
          message={notice.message}
          actionLabel={notice.undo ? '되돌리기' : undefined}
          onAction={
            notice.undo &&
            (() => {
              setNotice(null);
              void run(notice.undo!);
            })
          }
          onClose={() => setNotice(null)}
        />
      )}
      {manualCopy !== null && (
        <CopyTextSheet title="정산 결과" text={manualCopy} onClose={() => setManualCopy(null)} />
      )}
    </>
  );
}

interface TransferRowProps {
  from: string;
  to: string;
  amount: string;
  /** The checkbox's name, e.g. `철수가 나에게 12,000원 보냄`. */
  label: string;
  /** Under the names, e.g. when it was recorded. */
  meta?: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}

/** A transfer with its "sent" checkbox; the whole row is the touch target. */
function TransferRow({ from, to, amount, label, meta, checked, disabled, onChange }: TransferRowProps) {
  return (
    <label className="flex min-h-14 cursor-pointer items-center gap-3 py-2 has-disabled:cursor-default">
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="size-5 shrink-0 accent-brand-500"
      />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[15px] font-semibold ${checked ? 'text-gray-500' : ''}`}>
          {from} → {to}
        </span>
        {meta && <span className="block text-sm text-gray-400">{meta}</span>}
      </span>
      <span
        className={`shrink-0 font-semibold tabular-nums ${checked ? 'text-gray-500' : ''}`}
      >
        {amount}
      </span>
    </label>
  );
}
