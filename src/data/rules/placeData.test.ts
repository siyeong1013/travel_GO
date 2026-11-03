import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/data/repositories';
import {
  expireBackupData,
  expireCity,
  expirePlace,
  needsRefresh,
  withCityData,
  withPlaceData,
} from '@/data/rules/placeData';
import { cleanPlace, cleanPlaceData, cleanTripFields } from '@/data/rules/validation';
import { emptyData, makeItem, makePlace, makeTrip, namedPlace, typedCity } from '@/test/fixtures';

const NOW = '2026-02-01T00:00:00.000Z';
/** `days` (and `minutes`) before NOW. */
const ago = (days: number, minutes = 0) =>
  new Date(Date.parse(NOW) - days * 86_400_000 - minutes * 60_000).toISOString();

const googleCity = (fetchedAt: string) => ({
  name: '오사카',
  placeId: 'osaka',
  location: { lat: 34.69, lng: 135.5 },
  fetchedAt,
});

describe('expiry of Google place data (30 days)', () => {
  it('removes the address and location, keeping the name and place id', () => {
    const place = makePlace('오사카성', { address: '주소', fetchedAt: ago(30) });
    expect(expirePlace(place, NOW)).toEqual({
      ...place,
      address: null,
      location: null,
      fetchedAt: null,
    });
    expect(expireCity(googleCity(ago(30)), NOW)).toEqual({
      ...googleCity(ago(30)),
      location: null,
      fetchedAt: null,
    });
  });

  it('keeps younger data and hand-entered places as they are', () => {
    const fresh = makePlace('오사카성', { fetchedAt: ago(29, 23 * 60 + 59) });
    expect(expirePlace(fresh, NOW)).toBe(fresh);
    const typed = namedPlace('호텔 체크인');
    expect(expirePlace(typed, NOW)).toBe(typed);
    const city = typedCity('오사카');
    expect(expireCity(city, NOW)).toBe(city);
  });

  it('applies to the trips and items of a backup', () => {
    const trip = makeTrip({ city: googleCity(ago(31)) });
    const old = makeItem({ tripId: trip.id, place: makePlace('a', { fetchedAt: ago(31) }) });
    const fresh = makeItem({ tripId: trip.id, place: makePlace('b', { fetchedAt: ago(1) }) });
    const data = expireBackupData({ ...emptyData(), trips: [trip], scheduleItems: [old, fresh] }, NOW);
    expect(data.trips[0]!.city.location).toBeNull();
    expect(data.scheduleItems[0]!.place.location).toBeNull();
    expect(data.scheduleItems[1]).toBe(fresh);
  });
});

describe('needsRefresh', () => {
  it('is due for Google data a week old, or already removed', () => {
    expect(needsRefresh('p', ago(7), NOW)).toBe(true);
    expect(needsRefresh('p', ago(6, 23 * 60), NOW)).toBe(false);
    expect(needsRefresh('p', null, NOW)).toBe(true);
    expect(needsRefresh(null, null, NOW)).toBe(false);
  });
});

describe('refreshed data', () => {
  const data = { placeId: 'p1', address: '새 주소', location: { lat: 1, lng: 2 }, fetchedAt: NOW };

  it("replaces Google's data of the same place, keeping the name", () => {
    const place = makePlace('성 구경', { placeId: 'p1', address: '옛 주소', fetchedAt: ago(8) });
    expect(withPlaceData(place, data)).toEqual({
      placeId: 'p1',
      name: '성 구경',
      address: '새 주소',
      location: { lat: 1, lng: 2 },
      fetchedAt: NOW,
    });
    expect(withCityData({ ...googleCity(ago(8)), placeId: 'p1' }, data)).toMatchObject({
      name: '오사카',
      location: { lat: 1, lng: 2 },
      fetchedAt: NOW,
    });
  });

  it('leaves another place alone', () => {
    const place = makePlace('다른 곳', { placeId: 'p2' });
    expect(withPlaceData(place, data)).toBe(place);
    const city = googleCity(ago(8));
    expect(withCityData(city, data)).toBe(city);
  });
});

describe('validation of Google data', () => {
  it('requires a fetch time with Google data, and drops it otherwise', () => {
    expect(() => cleanPlace(makePlace('오사카성', { fetchedAt: null }))).toThrow(ValidationError);
    expect(cleanPlace(makePlace('오사카성', { fetchedAt: NOW })).fetchedAt).toBe(NOW);
    // Hand-entered data is the user's own; a Google place without data has nothing to expire.
    expect(cleanPlace({ ...namedPlace('호텔'), fetchedAt: NOW }).fetchedAt).toBeNull();
    expect(cleanPlace(makePlace('오사카성', { location: null, fetchedAt: NOW })).fetchedAt).toBeNull();

    const trip = { title: '여행', startDate: '2026-11-10', endDate: '2026-11-12' };
    expect(() => cleanTripFields({ ...trip, city: { ...googleCity(NOW), fetchedAt: null } })).toThrow(
      ValidationError,
    );
    expect(cleanTripFields({ ...trip, city: googleCity(NOW) }).city.fetchedAt).toBe(NOW);
  });

  it('checks refreshed data', () => {
    const data = { placeId: 'p1', address: ' 주소 ', location: { lat: 1, lng: 2 }, fetchedAt: NOW };
    expect(cleanPlaceData(data).address).toBe('주소');
    expect(() => cleanPlaceData({ ...data, fetchedAt: 'yesterday' })).toThrow(ValidationError);
    expect(() => cleanPlaceData({ ...data, location: { lat: 100, lng: 0 } })).toThrow(ValidationError);
  });
});
