import { describe, expect, it } from 'vitest';
import { createBackupFile } from '@/data/rules/backupFormat';
import { makeMeCompanion } from '@/data/rules/companion';
import { planImport } from '@/data/rules/importPlan';
import { backupData, makeExpense, makeItem, makeTrip } from '@/test/fixtures';

const NOW = '2026-03-01T00:00:00.000Z';
const OLD = '2026-01-01T00:00:00.000Z';
const NEW = '2026-02-01T00:00:00.000Z';

describe('planImport (merge)', () => {
  it('keeps the newer record per id; ties keep the local one', () => {
    const tripNewerInFile = makeTrip({ id: 'trip-a', title: '로컬', updatedAt: OLD });
    const tripNewerLocally = makeTrip({ id: 'trip-b', title: '로컬', updatedAt: NEW });
    const tripTied = makeTrip({ id: 'trip-c', title: '로컬', updatedAt: OLD });
    const local = backupData({ trips: [tripNewerInFile, tripNewerLocally, tripTied] });

    const file = createBackupFile(
      backupData({
        trips: [
          { ...tripNewerInFile, title: '파일', updatedAt: NEW },
          { ...tripNewerLocally, title: '파일', updatedAt: OLD },
          { ...tripTied, title: '파일' },
          makeTrip({ id: 'trip-d' }),
        ],
      }),
      NOW,
    );

    const plan = planImport(local, file, 'merge', NOW);

    expect(plan.clearAll).toBe(false);
    expect(plan.summary.trips).toEqual({ added: 1, updated: 1, kept: 2, removed: 0 });
    expect(plan.summary.companions).toEqual({ added: 1, updated: 0, kept: 3, removed: 0 });
    expect(plan.put.trips.map((trip) => [trip.id, trip.title]).sort()).toEqual([
      ['trip-a', '파일'],
      ['trip-d', '오사카 여행'],
    ]);
  });

  it('renumbers a day when merged items share an order', () => {
    const trip = makeTrip({ id: 't' });
    const localItem = makeItem({ tripId: 't', id: 'local', order: 0, createdAt: OLD });
    const fileItem = makeItem({ tripId: 't', id: 'file', order: 0, createdAt: NEW });

    const plan = planImport(
      backupData({ trips: [trip], scheduleItems: [localItem] }),
      createBackupFile(backupData({ trips: [trip], scheduleItems: [fileItem] }), NOW),
      'merge',
      NOW,
    );

    expect(plan.summary.scheduleItems).toMatchObject({ added: 1 });
    // The local item already has order 0, so only the added item is written.
    expect(plan.put.scheduleItems).toEqual([{ ...fileItem, order: 1, updatedAt: NOW }]);
  });

  it('moves items outside the kept trip dates to the inbox', () => {
    const localTrip = makeTrip({ id: 't', startDate: '2026-11-10', endDate: '2026-11-11', updatedAt: NEW });
    const fileTrip = { ...localTrip, endDate: '2026-11-12', updatedAt: OLD };
    const lastDayItem = makeItem({ tripId: 't', id: 'last-day', date: '2026-11-12' });

    const plan = planImport(
      backupData({ trips: [localTrip] }),
      createBackupFile(backupData({ trips: [fileTrip], scheduleItems: [lastDayItem] }), NOW),
      'merge',
      NOW,
    );

    expect(plan.summary.trips.kept).toBe(1);
    expect(plan.summary.movedToInbox).toBe(1);
    expect(plan.put.scheduleItems).toEqual([{ ...lastDayItem, date: null, order: 0, updatedAt: NOW }]);
  });

  describe('expenses and their shares', () => {
    const trip = makeTrip({ id: 't' });
    const me = makeMeCompanion('t', OLD);
    const local = makeExpense({ id: 'e', tripId: 't', payerIds: [me.id], amount: 10_000, updatedAt: OLD }, [
      { companionId: me.id, weight: 1, amount: 10_000 },
    ]);
    const data = (expense: typeof local) => {
      const { shares, ...record } = expense;
      return backupData({ trips: [trip], companions: [me], expenses: [record], expenseShares: shares });
    };

    it('replaces all local shares when the file has the newer expense', () => {
      const newer = makeExpense({ ...local, amount: 12_000, updatedAt: NEW }, [
        { companionId: me.id, weight: 1, amount: 12_000 },
      ]);

      const plan = planImport(data(local), createBackupFile(data(newer), NOW), 'merge', NOW);

      expect(plan.summary.expenses).toMatchObject({ updated: 1 });
      expect(plan.put.expenses).toEqual([expect.objectContaining({ id: 'e', amount: 12_000 })]);
      expect(plan.put.expenseShares).toEqual(newer.shares);
      expect(plan.deleteShareIds).toEqual(local.shares.map((share) => share.id));
    });

    it('leaves local shares alone when the local expense is newer', () => {
      const older = makeExpense({ ...local, amount: 9_000, updatedAt: '2025-12-01T00:00:00.000Z' }, [
        { companionId: me.id, weight: 1, amount: 9_000 },
      ]);

      const plan = planImport(data(local), createBackupFile(data(older), NOW), 'merge', NOW);

      expect(plan.summary.expenses).toMatchObject({ kept: 1 });
      expect(plan.put.expenses).toEqual([]);
      expect(plan.put.expenseShares).toEqual([]);
      expect(plan.deleteShareIds).toEqual([]);
    });
  });
});

describe('planImport (overwrite)', () => {
  it('replaces everything and reports what is removed', () => {
    const local = backupData({
      trips: [makeTrip({ id: 'old-1' }), makeTrip({ id: 'old-2' })],
      scheduleItems: [makeItem({ tripId: 'old-1' })],
    });
    const trip = makeTrip({ id: 'new' });
    const file = createBackupFile(
      backupData({
        trips: [trip],
        scheduleItems: [makeItem({ tripId: 'new' }), makeItem({ tripId: 'new', order: 1 })],
      }),
      NOW,
    );

    const plan = planImport(local, file, 'overwrite', NOW);

    expect(plan.clearAll).toBe(true);
    expect(plan.summary.trips).toEqual({ added: 1, updated: 0, kept: 0, removed: 2 });
    expect(plan.summary.scheduleItems).toEqual({ added: 2, updated: 0, kept: 0, removed: 1 });
    expect(plan.summary.companions).toEqual({ added: 1, updated: 0, kept: 0, removed: 2 });
    expect(plan.put.trips).toEqual([trip]);
    expect(plan.put.scheduleItems).toHaveLength(2);
  });
});

describe('planImport (visited countries)', () => {
  const JP = (visited: boolean, updatedAt: string) => ({ id: 'JP', visited, updatedAt });

  const TW = (visited: boolean, updatedAt: string) => ({ id: 'TW', visited, updatedAt });
  const VN = (visited: boolean, updatedAt: string) => ({ id: 'VN', visited, updatedAt });

  it('keeps the later change per country', () => {
    const local = backupData({ visitedCountries: [JP(true, OLD), TW(true, NEW)] });
    const file = createBackupFile(
      backupData({ visitedCountries: [JP(false, NEW), TW(false, OLD), VN(true, OLD)] }),
      NOW,
    );

    const plan = planImport(local, file, 'merge', NOW);
    expect(plan.summary.visitedCountries).toEqual({ added: 1, updated: 1, kept: 1, removed: 0 });
    expect(plan.put.visitedCountries).toEqual([JP(false, NEW), VN(true, OLD)]);
  });

  it('replaces them all when overwriting', () => {
    const local = backupData({ visitedCountries: [JP(true, OLD)] });
    const file = createBackupFile(backupData({}), NOW);
    expect(planImport(local, file, 'overwrite', NOW).summary.visitedCountries).toEqual({
      added: 0,
      updated: 0,
      kept: 0,
      removed: 1,
    });
  });
});
