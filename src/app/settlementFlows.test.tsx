/** @vitest-environment happy-dom */
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { repositories } from '@/data';
import type { Companion, Trip } from '@/data/models';
import type { NewExpense } from '@/data/repositories';
import { renderApp, resetApp } from '@/test/app';

vi.mock('@/data', async () => (await import('@/test/fixtures')).createTestData());

let trip: Trip;
let me: Companion;
let chulsoo: Companion;
let younghee: Companion;

beforeEach(async () => {
  await resetApp();
  trip = await repositories.trips.create({
    title: '오사카 여행',
    cities: [{ name: '오사카', placeId: null, location: null, fetchedAt: null }],
    startDate: '2026-11-10',
    endDate: '2026-11-12',
  });
  me = (await repositories.companions.listByTrip(trip.id))[0]!;
  chulsoo = await repositories.companions.create({ tripId: trip.id, name: '철수' });
  younghee = await repositories.companions.create({ tripId: trip.id, name: '영희' });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'share');
});

/** Split equally among everyone. */
const expense = (payer: Companion, amount: number): NewExpense => ({
  tripId: trip.id,
  date: '2026-11-10',
  amount,
  currency: 'KRW',
  exchangeRate: { rate: '1', source: 'same', fetchedAt: null },
  category: 'food',
  paymentMethod: 'card',
  payerIds: [payer.id],
  splitMethod: 'equal',
  participants: [me, chulsoo, younghee].map((c) => ({ companionId: c.id, value: null })),
  memo: '',
  scheduleItemId: null,
});

/** 나 paid 90,000 and 철수 30,000; everyone owes 40,000: 나 +50,000, 철수 −10,000, 영희 −40,000. */
async function spendTogether() {
  await repositories.expenses.create(expense(me, 90_000));
  await repositories.expenses.create(expense(chulsoo, 30_000));
}

const section = (title: string) => screen.getByRole('region', { name: title });
const queryRegion = (title: string) => screen.queryByRole('region', { name: title });
const items = (title: string) =>
  within(section(title))
    .getAllByRole('listitem')
    .map((item) => item.textContent);

describe('settlement', () => {
  it('plans the fewest transfers and checks them off as they are sent', async () => {
    await spendTogether();
    const { user } = renderApp(`/trips/${trip.id}?tab=expenses`);

    await user.click(await screen.findByRole('link', { name: '정산 송금 2건 남았어요' }));
    expect(await screen.findByRole('heading', { name: '정산' })).toBeInTheDocument();
    // The header comes first; the page once the ledger and the rates used before are read.
    await screen.findByRole('region', { name: '주고받을 돈' });
    expect(items('주고받을 돈')).toEqual([
      '나받을 돈 50,000원',
      '철수보낼 돈 10,000원',
      '영희보낼 돈 40,000원',
    ]);
    expect(items('송금할 돈')).toEqual(['철수 → 나10,000원', '영희 → 나40,000원']);
    expect(queryRegion('송금 완료')).not.toBeInTheDocument();

    // Sent: recorded, counted in the balances, and off the list (with undo).
    await user.click(screen.getByRole('checkbox', { name: '영희가 나에게 40,000원 보냄' }));
    expect(await screen.findByText('영희 → 나 40,000원을 송금 완료로 표시했어요.')).toBeInTheDocument();
    expect(items('송금할 돈')).toEqual(['철수 → 나10,000원']);
    expect(within(section('송금 완료')).getByRole('checkbox', { name: '영희가 나에게 40,000원 보냄' })).toBeChecked();
    expect(items('주고받을 돈')).toEqual(['나받을 돈 10,000원', '철수보낼 돈 10,000원', '영희없음']);

    await user.click(screen.getByRole('button', { name: '되돌리기' }));
    await waitFor(() => expect(queryRegion('송금 완료')).not.toBeInTheDocument());
    expect(items('송금할 돈')).toHaveLength(2);
    expect(await repositories.settlements.listByTrip(trip.id)).toEqual([]);

    // Unchecking a done transfer deletes the record.
    await user.click(screen.getByRole('checkbox', { name: '영희가 나에게 40,000원 보냄' }));
    const done = await screen.findByRole('region', { name: '송금 완료' });
    await user.click(within(done).getByRole('checkbox', { name: '영희가 나에게 40,000원 보냄' }));
    expect(await screen.findByText('송금 완료 표시를 취소했어요.')).toBeInTheDocument();
    expect(items('송금할 돈')).toHaveLength(2);

    // All sent
    await user.click(screen.getByRole('checkbox', { name: '철수가 나에게 10,000원 보냄' }));
    await waitFor(() => expect(items('송금 완료')).toHaveLength(1));
    await user.click(screen.getByRole('checkbox', { name: '영희가 나에게 40,000원 보냄' }));
    expect(await screen.findByText('모두 정산했어요.')).toBeInTheDocument();
    expect(items('주고받을 돈')).toEqual(['나없음', '철수없음', '영희없음']);
    expect(
      (await repositories.settlements.listByTrip(trip.id)).map((s) => [s.fromId, s.toId, s.amount]),
    ).toEqual([
      [chulsoo.id, me.id, 10_000],
      [younghee.id, me.id, 40_000],
    ]);

    await user.click(screen.getByRole('button', { name: '뒤로' }));
    expect(await screen.findByRole('link', { name: '정산 주고받을 돈이 없어요' })).toBeInTheDocument();
  });

  it('copies the result as text, or shows it to copy by hand', async () => {
    await spendTogether();
    const { user } = renderApp(`/trips/${trip.id}/expenses/settlement`);

    await user.click(await screen.findByRole('button', { name: '정산 결과 복사' }));
    expect(await screen.findByText('정산 결과를 복사했어요. 채팅방에 붙여 넣어 공유하세요.')).toBeInTheDocument();
    const text = [
      '[오사카 여행 정산]',
      '총 지출 120,000원 · 3명',
      '',
      '각자 쓴 돈',
      '- 나 40,000원',
      '- 철수 40,000원',
      '- 영희 40,000원',
      '',
      '송금할 돈',
      '- 철수 → 나 10,000원',
      '- 영희 → 나 40,000원',
    ].join('\n');
    expect(await navigator.clipboard.readText()).toBe(text);

    // No clipboard here (e.g. http://<LAN IP>): the text, to copy by hand.
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('not allowed'));
    await user.click(screen.getByRole('button', { name: '정산 결과 복사' }));
    const sheet = await screen.findByRole('dialog', { name: '정산 결과' });
    expect(within(sheet).getByRole('textbox', { name: '정산 결과' })).toHaveValue(text);
  });

  it('opens the share sheet where there is one', async () => {
    await spendTogether();
    const share = vi.fn<(data: ShareData) => Promise<void>>(async () => undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const { user } = renderApp(`/trips/${trip.id}/expenses/settlement`);

    await user.click(await screen.findByRole('button', { name: '공유' }));
    expect(share).toHaveBeenCalledWith({ text: expect.stringContaining('- 영희 → 나 40,000원') });
  });

  it('has nothing to settle alone or before spending', async () => {
    const solo = await repositories.trips.create({
      title: '혼자 여행',
      cities: [{ name: '후쿠오카', placeId: null, location: null, fetchedAt: null }],
      startDate: '2026-12-01',
      endDate: '2026-12-02',
    });
    renderApp(`/trips/${solo.id}?tab=expenses`);
    expect(await screen.findByRole('region', { name: '가계부 요약' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^정산/ })).not.toBeInTheDocument();

    cleanup();
    renderApp(`/trips/${solo.id}/expenses/settlement`);
    expect(await screen.findByText('함께 정산할 사람이 없어요')).toBeInTheDocument();
  });

  it('keeps someone with a recorded transfer, saying where to undo it', async () => {
    await spendTogether();
    await repositories.settlements.create({
      tripId: trip.id,
      fromId: younghee.id,
      toId: me.id,
      amount: 40_000,
    });
    const { user } = renderApp(`/trips/${trip.id}?tab=expenses`);

    await user.click(await screen.findByRole('button', { name: '동행자 관리' }));
    await user.click(screen.getByRole('button', { name: '영희 삭제' }));
    const blocked = await screen.findByRole('dialog', { name: '영희를 삭제할 수 없어요' });
    expect(blocked).toHaveTextContent('정산 화면에서 송금 완료 표시를 취소한 뒤 다시 시도해 주세요.');
  });
});
