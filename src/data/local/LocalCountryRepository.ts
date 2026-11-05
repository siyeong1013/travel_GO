import type { TravelGoDB } from '@/data/local/db';
import type { VisitedCountry } from '@/data/models';
import { type CountryRepository, ValidationError } from '@/data/repositories';
import { countryStamp, isCountryCode } from '@/data/rules/country';
import type { Clock } from '@/lib/dates';

export function createLocalCountryRepository(db: TravelGoDB, now: Clock): CountryRepository {
  return {
    async list() {
      const all = await db.visitedCountries.orderBy('id').toArray();
      return all.filter((country) => country.visited);
    },

    listAll() {
      return db.visitedCountries.orderBy('id').toArray();
    },

    async set(code, visited) {
      if (!isCountryCode(code)) throw new ValidationError(`not a country code: ${code}`);
      return db.transaction('rw', db.visitedCountries, async () => {
        const current = await db.visitedCountries.get(code);
        const country: VisitedCountry = {
          id: code,
          visited,
          updatedAt: countryStamp(now(), current?.updatedAt),
        };
        await db.visitedCountries.put(country);
        return country;
      });
    },
  };
}
