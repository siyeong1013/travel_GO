import type { TravelGoDB } from '@/data/local/db';
import type { Settlement } from '@/data/models';
import {
  EntityNotFoundError,
  type SettlementRepository,
  ValidationError,
} from '@/data/repositories';
import { isAmount } from '@/data/rules/money';
import type { Clock } from '@/lib/dates';
import { newId } from '@/lib/id';

export function createLocalSettlementRepository(db: TravelGoDB, now: Clock): SettlementRepository {
  return {
    listByTrip(tripId) {
      return db.settlements.where('tripId').equals(tripId).sortBy('createdAt');
    },

    create(input) {
      return db.transaction('rw', db.trips, db.companions, db.settlements, async () => {
        const trip = await db.trips.get(input.tripId);
        if (!trip) throw new EntityNotFoundError('trip', input.tripId);
        const companionIds = new Set(
          (await db.companions.where('tripId').equals(trip.id).toArray()).map((c) => c.id),
        );
        if (!companionIds.has(input.fromId) || !companionIds.has(input.toId)) {
          throw new ValidationError('sender and receiver must be on this trip');
        }
        if (input.fromId === input.toId) throw new ValidationError('cannot send to oneself');
        if (!isAmount(input.amount)) throw new ValidationError('amount must be a positive whole number');

        const timestamp = now();
        const settlement: Settlement = {
          id: newId(),
          tripId: trip.id,
          fromId: input.fromId,
          toId: input.toId,
          amount: input.amount,
          currency: trip.settlementCurrency,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        await db.settlements.add(settlement);
        return settlement;
      });
    },

    async delete(id) {
      await db.settlements.delete(id);
    },
  };
}
