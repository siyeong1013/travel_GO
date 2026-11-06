import { describe, expect, it } from 'vitest';
import {
  airportPlaceName,
  arrivalText,
  flightItem,
  flightNumberItem,
  flightNumberOf,
  flightRoute,
  flightStop,
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

const OSAKA_TRIP = { countries: ['JP'], startDate: '2026-12-01', endDate: '2026-12-03' };

describe('flightItem', () => {
  it('goes in at its departure time, at its airport, with the airports in Korean', () => {
    expect(flightItem(leg(), OSAKA_TRIP)).toEqual({
      place: {
        placeId: null,
        name: 'KE723 인천 → 간사이',
        address: '간사이 공항 (KIX)',
        location: { lat: 34.43, lng: 135.24 },
        fetchedAt: null,
      },
      time: '09:00',
      memo: 'Korean Air · 인천 T2 출발 → 간사이 T1 도착 10:55',
    });
  });

  it('names airports it doesn’t know as the flight data does', () => {
    const { place } = flightItem(leg({ iata: 'XYZ', name: 'Somewhere', terminal: null }), OSAKA_TRIP);
    expect(place.name).toBe('KE723 인천 → Somewhere');
    expect(place.address).toBe('Somewhere 공항 (XYZ)');
  });

  it('is at its airport without a point, or a code, when the data has none', () => {
    expect(flightItem(leg({ location: null }), OSAKA_TRIP).place.location).toBeNull();
    expect(airportPlaceName({ ...KANSAI, iata: null })).toBe('Osaka Kansai 공항');
  });

  it('says when it lands on another day', () => {
    expect(arrivalText(leg({ date: '2026-12-02', time: '06:30' }))).toBe('다음 날 06:30');
    expect(arrivalText(leg({ date: '2026-12-03', time: '06:30' }))).toMatch(/^12\.3 .* 06:30$/);
    expect(arrivalText(leg({ time: null }))).toBe('');
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

describe('flightStop', () => {
  const back = (date: string, trip = OSAKA_TRIP): string | null =>
    flightStop(leg({ ...INCHEON, date }, { ...KANSAI, date }), trip).iata;

  it('is where the flight lands', () => {
    expect(flightStop(leg(), OSAKA_TRIP).iata).toBe('KIX');
    // A trip from before trips had countries.
    expect(flightStop(leg(), { ...OSAKA_TRIP, countries: [] }).iata).toBe('KIX');
    // From one of its countries to another.
    const via = leg({ iata: 'HKG', countryCode: 'HK' }, KANSAI);
    expect(flightStop(via, { ...OSAKA_TRIP, countries: ['JP', 'HK'] }).iata).toBe('HKG');
  });

  it('is where it leaves from on the way home: out of the trip’s countries, or on its last day', () => {
    expect(back('2026-12-02')).toBe('KIX');
    expect(back('2026-12-02', { ...OSAKA_TRIP, countries: [] })).toBe('ICN');
    expect(back('2026-12-03', { ...OSAKA_TRIP, countries: [] })).toBe('KIX');
    expect(back('2026-12-04', { ...OSAKA_TRIP, countries: [] })).toBe('KIX');
    // A day trip's last day is its first too.
    expect(back('2026-12-01', { countries: [], startDate: '2026-12-01', endDate: '2026-12-01' })).toBe('ICN');
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
  const flight = 'Korean Air · 인천 T2 출발 → 간사이 T1 도착 10:55';

  it('puts the flight on top of what the memo says', () => {
    expect(withFlightMemo('', flight)).toBe(flight);
    expect(withFlightMemo('  ', flight)).toBe(flight);
    expect(withFlightMemo('좌석 32A', flight)).toBe(`${flight}\n좌석 32A`);
  });

  it('doesn’t put it in twice', () => {
    expect(withFlightMemo(`${flight}\n좌석 32A`, flight)).toBe(`${flight}\n좌석 32A`);
  });
});
