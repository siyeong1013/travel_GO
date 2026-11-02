import type { TravelGoDB } from '@/data/local/db';
import type { BackupRepository } from '@/data/repositories';
import { createBackupFile } from '@/data/rules/backupFormat';
import { planImport } from '@/data/rules/importPlan';
import type { Clock } from '@/lib/dates';

export function createLocalBackupRepository(db: TravelGoDB, now: Clock): BackupRepository {
  const snapshot = async () => ({
    trips: await db.trips.toArray(),
    scheduleItems: await db.scheduleItems.toArray(),
  });

  return {
    exportAll() {
      return db.transaction('r', db.trips, db.scheduleItems, async () => {
        const { trips, scheduleItems } = await snapshot();
        return createBackupFile(trips, scheduleItems, now());
      });
    },

    previewImport(file, mode) {
      return db.transaction('r', db.trips, db.scheduleItems, async () => {
        return planImport(await snapshot(), file, mode, now()).summary;
      });
    },

    importAll(file, mode) {
      return db.transaction('rw', db.trips, db.scheduleItems, async () => {
        const plan = planImport(await snapshot(), file, mode, now());
        if (plan.clearAll) {
          await db.trips.clear();
          await db.scheduleItems.clear();
        }
        await db.trips.bulkPut(plan.putTrips);
        await db.scheduleItems.bulkPut(plan.putScheduleItems);
        return plan.summary;
      });
    },
  };
}
