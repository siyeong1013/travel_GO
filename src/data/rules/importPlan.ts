import type {
  BackupFile,
  ID,
  ImportCounts,
  ImportMode,
  ImportSummary,
  ISODateTime,
  ScheduleItem,
  Trip,
} from '@/data/models';
import { normalizeSchedule } from '@/data/rules/schedule';
import { compareIsoDateTime } from '@/lib/dates';

export interface DataSnapshot {
  trips: Trip[];
  scheduleItems: ScheduleItem[];
}

export interface ImportPlan {
  summary: ImportSummary;
  /** Delete all local data before writing (overwrite mode). */
  clearAll: boolean;
  putTrips: Trip[];
  putScheduleItems: ScheduleItem[];
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
  return { merged, written };
}

/** Decides what an import writes. Pure, so preview and import always agree. */
export function planImport(
  local: DataSnapshot,
  file: BackupFile,
  mode: ImportMode,
  now: ISODateTime,
): ImportPlan {
  const summary: ImportSummary = {
    mode,
    trips: emptyCounts(),
    scheduleItems: emptyCounts(),
    movedToInbox: 0,
  };

  if (mode === 'overwrite') {
    summary.trips.added = file.trips.length;
    summary.trips.removed = local.trips.length;
    summary.scheduleItems.added = file.scheduleItems.length;
    summary.scheduleItems.removed = local.scheduleItems.length;

    const { changed, movedToInbox } = normalizeSchedule(file.trips, file.scheduleItems, now);
    summary.movedToInbox = movedToInbox;
    const fixed = new Map(changed.map((item) => [item.id, item]));
    return {
      summary,
      clearAll: true,
      putTrips: file.trips,
      putScheduleItems: file.scheduleItems.map((item) => fixed.get(item.id) ?? item),
    };
  }

  const trips = mergeById(local.trips, file.trips, summary.trips);
  const items = mergeById(local.scheduleItems, file.scheduleItems, summary.scheduleItems);

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

  return {
    summary,
    clearAll: false,
    putTrips: [...trips.written].map((id) => trips.merged.get(id)!),
    putScheduleItems: [...items.written].map((id) => items.merged.get(id)!),
  };
}
