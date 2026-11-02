import type {
  BackupData,
  ID,
  ImportCounts,
  ImportMode,
  ImportSummary,
  ISODateTime,
} from '@/data/models';
import { normalizeSchedule } from '@/data/rules/schedule';
import { compareIsoDateTime } from '@/lib/dates';

export interface ImportPlan {
  summary: ImportSummary;
  /** Delete all local data before writing (overwrite mode). */
  clearAll: boolean;
  /** Records to write. */
  put: BackupData;
  /** Local shares of expenses replaced by the file's version (deleted before writing). */
  deleteShareIds: ID[];
}

const emptyCounts = (): ImportCounts => ({ added: 0, updated: 0, kept: 0, removed: 0 });

/** Newer `updatedAt` wins; on a tie the local record is kept. */
function mergeById<T extends { id: ID; updatedAt: ISODateTime }>(
  local: T[],
  incoming: T[],
  counts: ImportCounts,
) {
  const merged = new Map(local.map((record) => [record.id, record]));
  const written = new Set<ID>();
  for (const record of incoming) {
    const current = merged.get(record.id);
    if (!current) counts.added++;
    else if (compareIsoDateTime(record.updatedAt, current.updatedAt) > 0) counts.updated++;
    else {
      counts.kept++;
      continue;
    }
    merged.set(record.id, record);
    written.add(record.id);
  }
  const writes = () => [...written].map((id) => merged.get(id)!);
  return { merged, written, writes };
}

/** Decides what an import writes. Pure, so preview and import always agree. */
export function planImport(
  local: BackupData,
  file: BackupData,
  mode: ImportMode,
  now: ISODateTime,
): ImportPlan {
  const summary: ImportSummary = {
    mode,
    trips: emptyCounts(),
    scheduleItems: emptyCounts(),
    companions: emptyCounts(),
    expenses: emptyCounts(),
    settlements: emptyCounts(),
    movedToInbox: 0,
  };

  if (mode === 'overwrite') {
    for (const key of ['trips', 'scheduleItems', 'companions', 'expenses', 'settlements'] as const) {
      summary[key].added = file[key].length;
      summary[key].removed = local[key].length;
    }
    const { changed, movedToInbox } = normalizeSchedule(file.trips, file.scheduleItems, now);
    summary.movedToInbox = movedToInbox;
    const fixed = new Map(changed.map((item) => [item.id, item]));
    return {
      summary,
      clearAll: true,
      put: {
        ...file,
        scheduleItems: file.scheduleItems.map((item) => fixed.get(item.id) ?? item),
      },
      deleteShareIds: [],
    };
  }

  const trips = mergeById(local.trips, file.trips, summary.trips);
  const items = mergeById(local.scheduleItems, file.scheduleItems, summary.scheduleItems);
  const companions = mergeById(local.companions, file.companions, summary.companions);
  const expenses = mergeById(local.expenses, file.expenses, summary.expenses);
  const settlements = mergeById(local.settlements, file.settlements, summary.settlements);

  // Merged records can disagree (an item from the file on a day the kept trip no longer has,
  // two items with the same order), so repair the merged result as a whole.
  const { changed, movedToInbox } = normalizeSchedule(
    [...trips.merged.values()],
    [...items.merged.values()],
    now,
  );
  summary.movedToInbox = movedToInbox;
  for (const item of changed) {
    items.merged.set(item.id, item);
    items.written.add(item.id);
  }

  // An expense travels with its shares: when the file's version wins, so do all its shares.
  return {
    summary,
    clearAll: false,
    put: {
      trips: trips.writes(),
      scheduleItems: items.writes(),
      companions: companions.writes(),
      expenses: expenses.writes(),
      expenseShares: file.expenseShares.filter((share) => expenses.written.has(share.expenseId)),
      settlements: settlements.writes(),
    },
    deleteShareIds: local.expenseShares
      .filter((share) => expenses.written.has(share.expenseId))
      .map((share) => share.id),
  };
}
