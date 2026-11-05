import type { TravelGoDB } from '@/data/local/db';
import { createLocalBackupRepository } from '@/data/local/LocalBackupRepository';
import { createLocalCompanionRepository } from '@/data/local/LocalCompanionRepository';
import { createLocalCountryRepository } from '@/data/local/LocalCountryRepository';
import { createLocalExpenseRepository } from '@/data/local/LocalExpenseRepository';
import { createLocalScheduleRepository } from '@/data/local/LocalScheduleRepository';
import { createLocalSettlementRepository } from '@/data/local/LocalSettlementRepository';
import { createLocalTripRepository } from '@/data/local/LocalTripRepository';
import type { Repositories } from '@/data/repositories';
import { type Clock, nowIso } from '@/lib/dates';

export { createTravelGoDB, type TravelGoDB } from '@/data/local/db';

export function createLocalRepositories(db: TravelGoDB, now: Clock = nowIso): Repositories {
  return {
    trips: createLocalTripRepository(db, now),
    schedule: createLocalScheduleRepository(db, now),
    companions: createLocalCompanionRepository(db, now),
    expenses: createLocalExpenseRepository(db, now),
    settlements: createLocalSettlementRepository(db, now),
    countries: createLocalCountryRepository(db, now),
    backup: createLocalBackupRepository(db, now),
  };
}
