import { describe, expect, it } from 'vitest';
import {
  airportPlaceName,
  flightItems,
  flightNumberItem,
  flightNumberOf,
  flightRoute,
  withFlightMemo,
} from '@/features/schedule/flightItem';
import type { FlightEnd, FlightLeg } from '@/lib/flights';

const INCHEON: FlightEnd = {
  iata: 'ICN',
  name: 'Incheon',
  countryCode: 'KR',
  location: { lat: 37.46, lng: 126.44 },
  date: '2026-12-01',
  time: '09:00',
  terminal: '2',
};
const KANSAI: FlightEnd = {
  iata: 'KIX',
  name: 'Osaka Kansai',
  countryCode: 'JP',
  location: { lat: 34.43, lng: 135.24 },
  date: '2026-12-01',
  time: '10:55',
  terminal: 'T1',
};

const leg = (arrival: Partial<FlightEnd> = {}, departure: Partial<FlightEnd> = {}): FlightLeg => ({
  number: 'KE723',
  airline: 'Korean Air',
  departure: { ...INCHEON, ...departure },
  arrival: { ...KANSAI, ...arrival },
});

describe('flightItems', () => {
  it('are the airport it leaves from, the flight in its memo, then the one it lands at', () => {
    expect(flightItems(leg())).toEqual([
      {
        place: {
          placeId: null,
          name: '인천 공항 (ICN)',
          address: null,
          location: { lat: 37.46, lng: 126.44 },
          fetchedAt: null,
        },
        time: '09:00',
        memo: 'KE723 인천 → 간사이 · Korean Air\n인천 T2 출발 → 간사이 T1 도착 10:55',
      },
      {
        place: {
          placeId: null,
          name: '간사이 공항 (KIX)',
          address: null,
          location: { lat: 34.43, lng: 135.24 },
          fetchedAt: null,
        },
        time: '10:55',
        memo: '',
      },
    ]);
  });

  it('name airports they don’t know as the flight data does', () => {
    const [departure, arrival] = flightItems(leg({ iata: 'XYZ', name: 'Somewhere', terminal: null }));
    expect(arrival.place.name).toBe('Somewhere 공항 (XYZ)');
    expect(departure.memo).toBe('KE723 인천 → Somewhere · Korean Air\n인천 T2 출발 → Somewhere 도착 10:55');
  });

  it('are at their airports without a point, or a code, when the data has none', () => {
    expect(flightItems(leg({ location: null }))[1].place.location).toBeNull();
    expect(airportPlaceName({ ...KANSAI, iata: null })).toBe('Osaka Kansai 공항');
  });

  it('say when it lands on another day as the route does', () => {
    const route = (arrival: Partial<FlightEnd>) => flightItems(leg(arrival))[0].memo.split('\n')[1];
    expect(route({ date: '2026-12-02', time: '06:30' })).toBe('인천 T2 출발 → 간사이 T1 도착 06:30(+1일)');
    expect(route({ date: '2026-12-03', time: '06:30' })).toMatch(/ 도착 06:30\(\+2일\)$/);
    expect(route({ time: null })).toBe('인천 T2 출발 → 간사이 T1 도착');
    // No airline: the flight alone.
    expect(flightItems({ ...leg(), airline: null })[0].memo).toMatch(/^KE723 인천 → 간사이\n/);
  });
});

describe('flightRoute', () => {
  it('writes the ends as airlines do, with the day it lands after the time', () => {
    expect(flightRoute(leg())).toEqual(['인천(ICN) 09:00', '간사이(KIX) 10:55']);
    expect(flightRoute(leg({ date: '2026-12-02', time: '06:30' }))[1]).toBe('간사이(KIX) 06:30(+1일)');
    expect(flightRoute(leg({ date: '2026-12-03', time: '06:30' }))[1]).toBe('간사이(KIX) 06:30(+2일)');
    // Over the date line eastward: the day before.
    const honolulu = leg({ iata: 'HNL', date: '2026-11-30', time: '10:00' });
    expect(flightRoute(honolulu)[1]).toBe('호놀룰루(HNL) 10:00(-1일)');
  });

  it('leaves out what the data doesn’t have', () => {
    const somewhere = leg({ iata: null, name: 'Somewhere', time: null });
    expect(flightRoute(somewhere)).toEqual(['인천(ICN) 09:00', 'Somewhere']);
    expect(flightRoute(leg({}, { time: null }))[0]).toBe('인천(ICN)');
  });
});

describe('flightNumberItem', () => {
  it('is the flight’s number alone, to fill in later', () => {
    expect(flightNumberItem('KE724')).toEqual({
      place: { placeId: null, name: 'KE724', address: null, location: null, fetchedAt: null },
      time: null,
      memo: '',
    });
  });
});

describe('flightNumberOf', () => {
  it('is the number an item is named by, alone or as a found flight names it', () => {
    expect(flightNumberOf('ke 723')).toBe('KE723');
    expect(flightNumberOf('KE723 인천 → 간사이')).toBe('KE723');
    expect(flightNumberOf('7C1301 김포 → Somewhere')).toBe('7C1301');
  });

  it('is none for other names, even with something like a number in them', () => {
    expect(flightNumberOf('오사카성')).toBeNull();
    expect(flightNumberOf('SK1 타워')).toBeNull();
    expect(flightNumberOf('KTX 서울 → 부산')).toBeNull();
    expect(flightNumberOf('KE723 탑승')).toBeNull();
  });
});

describe('withFlightMemo', () => {
  const flight = 'KE723 인천 → 간사이 · Korean Air\n인천 T2 출발 → 간사이 T1 도착 10:55';

  it('puts the flight on top of what the memo says', () => {
    expect(withFlightMemo('', leg())).toBe(flight);
    expect(withFlightMemo('  ', leg())).toBe(flight);
    expect(withFlightMemo('좌석 32A', leg())).toBe(`${flight}\n좌석 32A`);
  });

  it('doesn’t put it in twice', () => {
    expect(withFlightMemo(`${flight}\n좌석 32A`, leg())).toBe(`${flight}\n좌석 32A`);
  });

  it('takes the place of the same flight’s memo from before', () => {
    // The one line it was, the next day's time written out.
    const before = 'Korean Air · 인천 T2 출발 → 간사이 T1 도착 다음 날 00:20';
    expect(withFlightMemo(`${before}\n좌석 32A`, leg({ date: '2026-12-02', time: '00:20' }))).toBe(
      'KE723 인천 → 간사이 · Korean Air\n인천 T2 출발 → 간사이 T1 도착 00:20(+1일)\n좌석 32A',
    );
    // Landing at another time now.
    expect(withFlightMemo(`${flight}\n좌석 32A`, leg({ time: '11:10' }))).toBe(
      'KE723 인천 → 간사이 · Korean Air\n인천 T2 출발 → 간사이 T1 도착 11:10\n좌석 32A',
    );
    // Another flight's stays.
    const jin = { ...leg(), number: 'LJ201', airline: 'Jin Air' };
    expect(withFlightMemo(flight, jin)).toBe(
      `LJ201 인천 → 간사이 · Jin Air\n인천 T2 출발 → 간사이 T1 도착 10:55\n${flight}`,
    );
  });
});
