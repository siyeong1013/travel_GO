import { describe, expect, it } from 'vitest';
import { createBackupFile } from '@/data/rules/backupFormat';
import { planImport } from '@/data/rules/importPlan';
import { makeItem, makeTrip } from '@/test/fixtures';

const NOW = '2026-03-01T00:00:00.000Z';
const OLD = '2026-01-01T00:00:00.000Z';
const NEW = '2026-02-01T00:00:00.000Z';

describe('planImport (merge)', () => {
  it('keeps the newer record per id; ties keep the local one', () => {
    const tripNewerInFile = makeTrip({ id: 'trip-a', title: '로컬', updatedAt: OLD });
    const tripNewerLocally = makeTrip({ id: 'trip-b', title: '로컬', updatedAt: NEW });
    const tripTied = makeTrip({ id: 'trip-c', title: '로컬', updatedAt: OLD });
    const local = { trips: [tripNewerInFile, tripNewerLocally, tripTied], scheduleItems: [] };

    const file = createBackupFile(
      [
        { ...tripNewerInFile, title: '파일', updatedAt: NEW },
        { ...tripNewerLocally, title: '파일', updatedAt: OLD },
        { ...tripTied, title: '파일' },
        makeTrip({ id: 'trip-d' }),
      ],
      [],
      NOW,
    );

    const plan = planImport(local, file, 'merge', NOW);

    expect(plan.clearAll).toBe(false);
    expect(plan.summary.trips).toEqual({ added: 1, updated: 1, kept: 2, removed: 0 });
    expect(plan.putTrips.map((trip) => [trip.id, trip.title]).sort()).toEqual([
      ['trip-a', '파일'],
      ['trip-d', '오사카 여행'],
    ]);
  });

  it('renumbers a day when merged items share an order', () => {
    const trip = makeTrip({ id: 't' });
    const localItem = makeItem({ tripId: 't', id: 'local', order: 0, createdAt: OLD });
    const fileItem = makeItem({ tripId: 't', id: 'file', order: 0, createdAt: NEW });

    const plan = planImport(
      { trips: [trip], scheduleItems: [localItem] },
      createBackupFile([trip], [fileItem], NOW),
      'merge',
      NOW,
    );

    expect(plan.summary.scheduleItems).toMatchObject({ added: 1 });
    // The local item already has order 0, so only the added item is written.
    expect(plan.putScheduleItems).toEqual([{ ...fileItem, order: 1, updatedAt: NOW }]);
  });

  it('moves items outside the kept trip dates to the inbox', () => {
    const localTrip = makeTrip({ id: 't', startDate: '2026-11-10', endDate: '2026-11-11', updatedAt: NEW });
    const fileTrip = { ...localTrip, endDate: '2026-11-12', updatedAt: OLD };
    const lastDayItem = makeItem({ tripId: 't', id: 'last-day', date: '2026-11-12' });

    const plan = planImport(
      { trips: [localTrip], scheduleItems: [] },
      createBackupFile([fileTrip], [lastDayItem], NOW),
      'merge',
      NOW,
    );

    expect(plan.summary.trips.kept).toBe(1);
    expect(plan.summary.movedToInbox).toBe(1);
    expect(plan.putScheduleItems).toEqual([{ ...lastDayItem, date: null, order: 0, updatedAt: NOW }]);
  });
});

describe('planImport (overwrite)', () => {
  it('replaces everything and reports what is removed', () => {
    const local = {
      trips: [makeTrip({ id: 'old-1' }), makeTrip({ id: 'old-2' })],
      scheduleItems: [makeItem({ tripId: 'old-1' })],
    };
    const trip = makeTrip({ id: 'new' });
    const file = createBackupFile([trip], [makeItem({ tripId: 'new' }), makeItem({ tripId: 'new', order: 1 })], NOW);

    const plan = planImport(local, file, 'overwrite', NOW);

    expect(plan.clearAll).toBe(true);
    expect(plan.summary.trips).toEqual({ added: 1, updated: 0, kept: 0, removed: 2 });
    expect(plan.summary.scheduleItems).toEqual({ added: 2, updated: 0, kept: 0, removed: 1 });
    expect(plan.putTrips).toEqual([trip]);
    expect(plan.putScheduleItems).toHaveLength(2);
  });
});
