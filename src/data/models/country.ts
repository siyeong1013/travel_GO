import type { ISODateTime } from '@/data/models/common';

/**
 * A country on the person's "다녀온 나라" map. One taken off it stays (`visited: false`), so the
 * change reaches their other devices; the later `updatedAt` wins, as with records.
 */
export interface VisitedCountry {
  /** ISO 3166-1 alpha-2 (`JP`; `XK` for Kosovo). */
  id: string;
  visited: boolean;
  updatedAt: ISODateTime;
}
