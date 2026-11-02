import type { TravelGoDB } from '@/data/local/db';
import type { BackupData } from '@/data/models';
import type { BackupRepository } from '@/data/repositories';
import { createBackupFile } from '@/data/rules/backupFormat';
import { planImport } from '@/data/rules/importPlan';
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
    exportAll() {
      return db.transaction('r', tables, async () => createBackupFile(await snapshot(), now()));
    },

    previewImport(file, mode) {
      return db.transaction('r', tables, async () => {
        return planImport(await snapshot(), file, mode, now()).summary;
      });
    },

    importAll(file, mode) {
      return db.transaction('rw', tables, async () => {
        const plan = planImport(await snapshot(), file, mode, now());
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
