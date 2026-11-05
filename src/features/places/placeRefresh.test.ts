import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlaceData } from '@/data/models';
import { refreshTripPlaceData } from '@/features/places/placeRefresh';
import { makeItem, makePlace, makeTrip, namedPlace } from '@/test/fixtures';

afterEach(() => vi.restoreAllMocks());

const NOW = '2026-02-01T00:00:00.000Z';
const ago = (days: number) => new Date(Date.parse(NOW) - days * 86_400_000).toISOString();

function setup(failing: string[] = []) {
  const fetched: string[] = [];
  const saved: { places: PlaceData[]; city: PlaceData | null } = { places: [], city: null };
  const deps = {
    fetchPlaceData: async (placeId: string): Promise<PlaceData> => {
      fetched.push(placeId);
      if (failing.includes(placeId)) throw new Error('NOT_FOUND');
      return { placeId, address: `${placeId} 주소`, location: { lat: 1, lng: 2 }, fetchedAt: NOW };
    },
    savePlaces: vi.fn(async (_tripId: string, places: PlaceData[]) => {
      saved.places = places;
    }),
    saveCity: vi.fn(async (_tripId: string, city: PlaceData) => {
      saved.city = city;
    }),
    now: () => NOW,
  };
  return { deps, fetched, saved };
}

describe('refreshTripPlaceData', () => {
  it('fetches data a week old or removed, once per place, and saves what came back', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const trip = makeTrip({
      cities: [{ name: '오사카', placeId: 'osaka', location: { lat: 34, lng: 135 }, fetchedAt: ago(8) }],
    });
    const at = (name: string, placeId: string, fetchedAt: string | null) =>
      makeItem({ tripId: trip.id, place: makePlace(name, { placeId, fetchedAt }) });
    const items = [
      at('오사카성', 'p1', ago(8)),
      at('천수각', 'p1', ago(8)),
      at('도톤보리', 'p2', ago(1)),
      makeItem({ tripId: trip.id, place: { ...namedPlace('사라진 곳'), placeId: 'p3' } }),
      makeItem({ tripId: trip.id, place: namedPlace('호텔 체크인') }),
      at('폐업한 곳', 'p4', ago(10)),
    ];
    const { deps, fetched, saved } = setup(['p4']);

    expect(await refreshTripPlaceData(trip, items, deps)).toBe(3);
    expect(fetched.sort()).toEqual(['osaka', 'p1', 'p3', 'p4']);
    expect(saved.places.map((place) => place.placeId).sort()).toEqual(['p1', 'p3']);
    expect(saved.city).toEqual({ placeId: 'osaka', address: 'osaka 주소', location: { lat: 1, lng: 2 }, fetchedAt: NOW });
    expect(deps.savePlaces).toHaveBeenCalledWith(trip.id, expect.any(Array));
  });

  it("refreshes each of the trip's cities that is a week old", async () => {
    const city = (placeId: string, fetchedAt: string) => ({
      name: placeId, placeId, location: { lat: 1, lng: 1 }, fetchedAt,
    });
    const trip = makeTrip({ cities: [city('osaka', ago(8)), city('kyoto', ago(1)), city('nara', ago(9))] });
    const { deps, fetched } = setup();

    expect(await refreshTripPlaceData(trip, [], deps)).toBe(2);
    expect(fetched.sort()).toEqual(['nara', 'osaka']);
    expect(deps.saveCity).toHaveBeenCalledTimes(2);
  });

  it('does nothing while everything is fresh', async () => {
    const trip = makeTrip();
    const items = [makeItem({ tripId: trip.id, place: makePlace('오사카성', { fetchedAt: ago(1) }) })];
    const { deps, fetched } = setup();

    expect(await refreshTripPlaceData(trip, items, deps)).toBe(0);
    expect(fetched).toEqual([]);
    expect(deps.savePlaces).not.toHaveBeenCalled();
    expect(deps.saveCity).not.toHaveBeenCalled();
  });
});
