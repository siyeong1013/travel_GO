import type { Companion, CurrencyCode, ID, Settlement, Trip } from '@/data/models';
import type { Ledger } from '@/data/rules/ledger';
import type { Transfer } from '@/data/rules/settlementPlan';
import { formatMoney, josa } from '@/lib/format';

/** Their name, or `?` for someone no longer on the trip. */
export function nameOf(companions: Companion[], id: ID): string {
  return companions.find((c) => c.id === id)?.name ?? '?';
}

/** Transfers in companion order: by sender, then receiver ("나" first). */
export function orderTransfers(transfers: Transfer[], companions: Companion[]): Transfer[] {
  const position = new Map(companions.map((c) => [c.id, c.order]));
  const at = (id: ID) => position.get(id) ?? Number.MAX_SAFE_INTEGER;
  return [...transfers].sort((a, b) => at(a.fromId) - at(b.fromId) || at(a.toId) - at(b.toId));
}

/** `받을 돈 12,000원`, `보낼 돈 12,000원`, or `없음`. */
export function balanceText(balance: number, currency: CurrencyCode): string {
  if (balance > 0) return `받을 돈 ${formatMoney(balance, currency)}`;
  if (balance < 0) return `보낼 돈 ${formatMoney(-balance, currency)}`;
  return '없음';
}

/** `철수가 나에게 12,000원 보냄`: the checkbox of a transfer (checked once it is done). */
export function transferLabel(
  transfer: Pick<Transfer, 'fromId' | 'toId' | 'amount'>,
  companions: Companion[],
  currency: CurrencyCode,
): string {
  const from = josa(nameOf(companions, transfer.fromId), '이/가');
  return `${from} ${nameOf(companions, transfer.toId)}에게 ${formatMoney(transfer.amount, currency)} 보냄`;
}

interface SettlementTextInput {
  trip: Pick<Trip, 'title'>;
  companions: Companion[];
  ledger: Ledger;
  /** Still to send (`orderTransfers`). */
  transfers: Transfer[];
  /** Already sent. */
  settlements: Settlement[];
}

/** Plain text to paste into a chat (KakaoTalk): who spent what, who sends whom, what is done. */
export function settlementText({
  trip,
  companions,
  ledger,
  transfers,
  settlements,
}: SettlementTextInput): string {
  const name = (id: ID) => nameOf(companions, id);
  const line = ({ fromId, toId, amount }: Transfer, currency = ledger.currency) =>
    `- ${name(fromId)} → ${name(toId)} ${formatMoney(amount, currency)}`;

  const lines = [
    `[${trip.title} 정산]`,
    `총 지출 ${formatMoney(ledger.total, ledger.currency)} · ${companions.length}명`,
    '',
    '각자 쓴 돈',
    ...ledger.balances.map(
      (entry) => `- ${name(entry.companionId)} ${formatMoney(entry.spent, ledger.currency)}`,
    ),
    '',
    ...(transfers.length > 0 ? ['송금할 돈', ...transfers.map((t) => line(t))] : ['모두 정산했어요.']),
  ];
  if (settlements.length > 0) {
    lines.push('', '송금 완료', ...settlements.map((s) => line(s, s.currency)));
  }
  if (ledger.unconvertible.length > 0) {
    lines.push('', `※ 환율을 다시 입력해야 하는 지출 ${ledger.unconvertible.length}건은 빠져 있어요.`);
  }
  return lines.join('\n');
}
