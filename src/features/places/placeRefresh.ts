import { useEffect, useEffectEvent } from 'react';
import type { ID, PlaceData, ScheduleItem, Trip } from '@/data/models';
import { needsRefresh } from '@/data/rules/placeData';
import { fetchPlaceData } from '@/features/places/placeSearch';
import { useSearchAvailability } from '@/features/places/usePlaceSearch';
import { scheduleStore } from '@/features/schedule/scheduleStore';
import { tripStore } from '@/features/trips/tripStore';
import { type Clock, nowIso } from '@/lib/dates';

export interface PlaceRefreshDeps {
  fetchPlaceData: (placeId: string) => Promise<PlaceData>;
  savePlaces: (tripId: ID, places: PlaceData[]) => Promise<void>;
  saveCity: (tripId: ID, city: PlaceData) => Promise<void>;
  now: Clock;
}

/** Place Details calls at a time. */
const CONCURRENCY = 4;

/**
 * Fetches Google's data again for the trip's places and cities once it is a week old (or was
 * removed at 30 days), so the trip keeps working offline for weeks. A place that fails is
 * skipped (and logged). Returns how many places, cities included, were refreshed.
 */
export async function refreshTripPlaceData(
  trip: Trip,
  items: ScheduleItem[],
  deps: PlaceRefreshDeps,
): Promise<number> {
  const timestamp = deps.now();
  const placeIds = new Set<string>();
  for (const { place } of items) {
    if (place.placeId !== null && needsRefresh(place.placeId, place.fetchedAt, timestamp)) {
      placeIds.add(place.placeId);
    }
  }
  const cityIds = new Set<string>();
  for (const city of trip.cities) {
    if (city.placeId !== null && needsRefresh(city.placeId, city.fetchedAt, timestamp)) {
      cityIds.add(city.placeId);
    }
  }

  const fetched = await fetchEach([...new Set([...placeIds, ...cityIds])], deps.fetchPlaceData);
  const places = [...placeIds].flatMap((placeId) => fetched.get(placeId) ?? []);
  if (places.length > 0) await deps.savePlaces(trip.id, places);
  const cities = [...cityIds].flatMap((placeId) => fetched.get(placeId) ?? []);
  for (const city of cities) await deps.saveCity(trip.id, city);
  return places.length + cities.length;
}

async function fetchEach(placeIds: string[], fetch: (placeId: string) => Promise<PlaceData>) {
  const fetched = new Map<string, PlaceData>();
  let next = 0;
  async function worker() {
    while (next < placeIds.length) {
      const placeId = placeIds[next++]!;
      try {
        fetched.set(placeId, await fetch(placeId));
      } catch (error) {
        console.error(`[travel GO] could not refresh place ${placeId}`, error);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, placeIds.length) }, worker));
  return fetched;
}

/** Trips being refreshed (StrictMode runs effects twice). */
const running = new Set<ID>();

/**
 * Refreshes the open trip's Google data once its items are loaded and search works (API key,
 * online): on opening the trip, and again on coming back online.
 */
export function usePlaceDataRefresh(
  trip: Trip | undefined,
  items: ScheduleItem[],
  itemsReady: boolean,
) {
  const availability = useSearchAvailability();
  const refresh = useEffectEvent(() => {
    if (!trip || running.has(trip.id)) return;
    running.add(trip.id);
    refreshTripPlaceData(trip, items, {
      fetchPlaceData,
      savePlaces: scheduleStore.getState().refreshPlaces,
      saveCity: tripStore.getState().refreshCity,
      now: nowIso,
    })
      .catch((error: unknown) => console.error(error))
      .finally(() => running.delete(trip.id));
  });

  const tripId = trip?.id;
  useEffect(() => {
    if (tripId !== undefined && itemsReady && availability === 'ready') refresh();
  }, [tripId, itemsReady, availability]);
}
