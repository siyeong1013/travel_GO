import type { ID, ISODateTime, LocalDate, ScheduleItem, Trip } from '@/data/models';
import type { ScheduleMoveTarget } from '@/data/repositories';
import { compareIsoDateTime, isDateInRange } from '@/lib/dates';

// Pure ordering rules. Functions taking `tripItems` expect every item of ONE trip and
// return only the items whose fields changed (with `updatedAt` set to `now`).

/** Days in date order, inbox last; within a group by `order`, then `createdAt`. */
export function compareItems(a: ScheduleItem, b: ScheduleItem): number {
  if (a.date !== b.date) {
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return a.date < b.date ? -1 : 1;
  }
  return (
    a.order - b.order ||
    compareIsoDateTime(a.createdAt, b.createdAt) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** One group (a day, or the inbox when `date` is null) in display order. */
export function itemsOn(tripItems: ScheduleItem[], date: LocalDate | null): ScheduleItem[] {
  return tripItems.filter((item) => item.date === date).sort(compareItems);
}

/** Puts `group` on `date` with orders 0..n-1 in array order. */
function assignOrder(
  group: ScheduleItem[],
  date: LocalDate | null,
  now: ISODateTime,
): ScheduleItem[] {
  return group.flatMap((item, order) =>
    item.order === order && item.date === date ? [] : [{ ...item, date, order, updatedAt: now }],
  );
}

/** Positions a new `item` at the end of its group. The result always includes `item`. */
export function planAppend(
  tripItems: ScheduleItem[],
  item: ScheduleItem,
  now: ISODateTime,
): ScheduleItem[] {
  const group = itemsOn(tripItems, item.date);
  return [...assignOrder(group, item.date, now), { ...item, order: group.length }];
}

export function planMove(
  tripItems: ScheduleItem[],
  id: ID,
  to: ScheduleMoveTarget,
  now: ISODateTime,
): ScheduleItem[] {
  const item = tripItems.find((i) => i.id === id);
  if (!item) return [];

  const source = itemsOn(tripItems, item.date).filter((i) => i.id !== id);
  const sameGroup = item.date === to.date;
  const target = sameGroup ? source : itemsOn(tripItems, to.date);
  const index = Math.min(Math.max(to.index, 0), target.length);
  const moved = [...target.slice(0, index), item, ...target.slice(index)];

  const changed = assignOrder(moved, to.date, now);
  return sameGroup ? changed : [...changed, ...assignOrder(source, item.date, now)];
}

/** Renumbers the rest of the removed items' groups. Does not include the removed items. */
export function planRemove(tripItems: ScheduleItem[], ids: ID[], now: ISODateTime): ScheduleItem[] {
  const removed = new Set(ids);
  const groups = new Set(tripItems.filter((i) => removed.has(i.id)).map((i) => i.date));
  return [...groups].flatMap((date) =>
    assignOrder(
      itemsOn(tripItems, date).filter((i) => !removed.has(i.id)),
      date,
      now,
    ),
  );
}

/** `items` with `changed` swapped in by id, back in display order. */
export function applyChanges(items: ScheduleItem[], changed: ScheduleItem[]): ScheduleItem[] {
  if (changed.length === 0) return items;
  const byId = new Map(changed.map((item) => [item.id, item]));
  return items.map((item) => byId.get(item.id) ?? item).sort(compareItems);
}

/** Dated items outside the trip's dates. */
export function findOutOfRange(
  trip: Pick<Trip, 'startDate' | 'endDate'>,
  tripItems: ScheduleItem[],
): ScheduleItem[] {
  return tripItems.filter(
    (item) => item.date !== null && !isDateInRange(item.date, trip.startDate, trip.endDate),
  );
}

/**
 * Repairs items after bulk changes (import, trip date changes): items outside their trip's
 * dates move to the end of the inbox, and every group is renumbered 0..n-1 keeping its current
 * order. Items of trips not in `trips` are left alone. Accepts items of any number of trips.
 */
export function normalizeSchedule(
  trips: Trip[],
  items: ScheduleItem[],
  now: ISODateTime,
): { changed: ScheduleItem[]; movedToInbox: number } {
  const tripsById = new Map(trips.map((trip) => [trip.id, trip]));
  const itemsByTrip = new Map<ID, ScheduleItem[]>();
  for (const item of items) {
    const list = itemsByTrip.get(item.tripId);
    if (list) list.push(item);
    else itemsByTrip.set(item.tripId, [item]);
  }

  const changed: ScheduleItem[] = [];
  let movedToInbox = 0;
  for (const [tripId, tripItems] of itemsByTrip) {
    const trip = tripsById.get(tripId);
    if (!trip) continue;

    const outside = findOutOfRange(trip, tripItems).sort(compareItems);
    const outsideIds = new Set(outside.map((item) => item.id));
    const inRange = tripItems.filter((item) => !outsideIds.has(item.id));

    for (const date of new Set(inRange.map((item) => item.date))) {
      if (date !== null) changed.push(...assignOrder(itemsOn(inRange, date), date, now));
    }
    changed.push(...assignOrder([...itemsOn(inRange, null), ...outside], null, now));
    movedToInbox += outside.length;
  }
  return { changed, movedToInbox };
}
