import type { TravelGoDB } from '@/data/local/db';
import { createLocalBackupRepository } from '@/data/local/LocalBackupRepository';
import { createLocalScheduleRepository } from '@/data/local/LocalScheduleRepository';
import { createLocalTripRepository } from '@/data/local/LocalTripRepository';
import type { Repositories } from '@/data/repositories';
import { type Clock, nowIso } from '@/lib/dates';

export { createTravelGoDB, type TravelGoDB } from '@/data/local/db';

export function createLocalRepositories(db: TravelGoDB, now: Clock = nowIso): Repositories {
  return {
    trips: createLocalTripRepository(db, now),
    schedule: createLocalScheduleRepository(db, now),
    backup: createLocalBackupRepository(db, now),
  };
}
