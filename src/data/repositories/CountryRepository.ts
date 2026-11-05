import type { VisitedCountry } from '@/data/models';

/** The person's "다녀온 나라": countries by ISO code. */
export interface CountryRepository {
  /** The countries they have been to, by code. */
  list(): Promise<VisitedCountry[]>;
  /** Every mark, by code: taken off ones too (`visited: false`). */
  listAll(): Promise<VisitedCountry[]>;
  /** Puts `code` on the map or takes it off. Throws `ValidationError` for a code that isn't one. */
  set(code: string, visited: boolean): Promise<VisitedCountry>;
}
