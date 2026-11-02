import { createLocalRepositories, createTravelGoDB } from '@/data/local';
import type { Repositories } from '@/data/repositories';

/**
 * The only place that picks the storage implementation.
 * Moving to the backend means adding `data/http/` and swapping this line.
 */
export const repositories: Repositories = createLocalRepositories(createTravelGoDB());
