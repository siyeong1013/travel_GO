import type { Trip } from '@/data/models';
import { compareIsoDateTime } from '@/lib/dates';

export function compareTrips(a: Trip, b: Trip): number {
  if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
  return compareIsoDateTime(a.createdAt, b.createdAt);
}
