import type { ID, Settlement } from '@/data/models';

export interface NewSettlement {
  tripId: ID;
  fromId: ID;
  toId: ID;
  /** Minor units of the trip's settlement currency. */
  amount: number;
}

export interface SettlementRepository {
  /** Sorted by `createdAt`. */
  listByTrip(tripId: ID): Promise<Settlement[]>;
  /** Recorded in the trip's settlement currency. */
  create(input: NewSettlement): Promise<Settlement>;
  /** No-op if it doesn't exist. */
  delete(id: ID): Promise<void>;
}
