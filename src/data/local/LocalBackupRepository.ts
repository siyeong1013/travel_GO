import type { TravelGoDB } from '@/data/local/db';
import type { BackupData } from '@/data/models';
import type { BackupRepository } from '@/data/repositories';
import { createBackupFile } from '@/data/rules/backupFormat';
import { planImport } from '@/data/rules/importPlan';
import { expireBackupData } from '@/data/rules/placeData';
import type { Clock } from '@/lib/dates';

export function createLocalBackupRepository(db: TravelGoDB, now: Clock): BackupRepository {
  const tables = [
    db.trips,
    db.scheduleItems,
    db.companions,
    db.expenses,
    db.expenseShares,
    db.settlements,
  ];

  const snapshot = async (): Promise<BackupData> => ({
    trips: await db.trips.toArray(),
    scheduleItems: await db.scheduleItems.toArray(),
    companions: await db.companions.toArray(),
    expenses: await db.expenses.toArray(),
    expenseShares: await db.expenseShares.toArray(),
    settlements: await db.settlements.toArray(),
  });

  return {
    // Google's place data older than 30 days neither leaves the app nor comes into it.
    exportAll() {
      return db.transaction('r', tables, async () => {
        const timestamp = now();
        return createBackupFile(expireBackupData(await snapshot(), timestamp), timestamp);
      });
    },

    previewImport(file, mode) {
      return db.transaction('r', tables, async () => {
        const timestamp = now();
        return planImport(await snapshot(), expireBackupData(file, timestamp), mode, timestamp)
          .summary;
      });
    },

    importAll(file, mode) {
      return db.transaction('rw', tables, async () => {
        const timestamp = now();
        const plan = planImport(await snapshot(), expireBackupData(file, timestamp), mode, timestamp);
        if (plan.clearAll) {
          for (const table of tables) await table.clear();
        }
        await db.expenseShares.bulkDelete(plan.deleteShareIds);
        await db.trips.bulkPut(plan.put.trips);
        await db.scheduleItems.bulkPut(plan.put.scheduleItems);
        await db.companions.bulkPut(plan.put.companions);
        await db.expenses.bulkPut(plan.put.expenses);
        await db.expenseShares.bulkPut(plan.put.expenseShares);
        await db.settlements.bulkPut(plan.put.settlements);
        return plan.summary;
      });
    },
  };
}
