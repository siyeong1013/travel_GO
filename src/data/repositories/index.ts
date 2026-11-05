import type { BackupRepository } from '@/data/repositories/BackupRepository';
import type { CompanionRepository } from '@/data/repositories/CompanionRepository';
import type { CountryRepository } from '@/data/repositories/CountryRepository';
import type { ExpenseRepository } from '@/data/repositories/ExpenseRepository';
import type { ScheduleRepository } from '@/data/repositories/ScheduleRepository';
import type { SettlementRepository } from '@/data/repositories/SettlementRepository';
import type { TripRepository } from '@/data/repositories/TripRepository';

export type * from '@/data/repositories/BackupRepository';
export type * from '@/data/repositories/CompanionRepository';
export type * from '@/data/repositories/CountryRepository';
export type * from '@/data/repositories/ExpenseRepository';
export type * from '@/data/repositories/ScheduleRepository';
export type * from '@/data/repositories/SettlementRepository';
export type * from '@/data/repositories/TripRepository';
export * from '@/data/repositories/errors';

export interface Repositories {
  trips: TripRepository;
  schedule: ScheduleRepository;
  companions: CompanionRepository;
  expenses: ExpenseRepository;
  settlements: SettlementRepository;
  countries: CountryRepository;
  backup: BackupRepository;
}
