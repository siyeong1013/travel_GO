import type { BackupRepository } from '@/data/repositories/BackupRepository';
import type { ScheduleRepository } from '@/data/repositories/ScheduleRepository';
import type { TripRepository } from '@/data/repositories/TripRepository';

export type * from '@/data/repositories/BackupRepository';
export type * from '@/data/repositories/ScheduleRepository';
export type * from '@/data/repositories/TripRepository';
export * from '@/data/repositories/errors';

export interface Repositories {
  trips: TripRepository;
  schedule: ScheduleRepository;
  backup: BackupRepository;
}
