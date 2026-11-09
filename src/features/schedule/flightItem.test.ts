import { describe, expect, it } from 'vitest';
import {
  airlineName,
  airportPlaceName,
  flightDetails,
  flightHeading,
  flightItems,
  flightNumberItem,
  flightNumberOf,
  flightRoute,
  flightWay,
  isFlightItem,
  scheduleFlight,
  withoutFlightMemo,
} from '@/features/schedule/flightItem';
import type { FlightEnd, FlightLeg } from '@/lib/flights';
import { makePlace, namedPlace } from '@/test/fixtures';

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
  it('are the airport it leaves from, the flight, then the one it lands at', () => {
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
        memo: '',
        flight: null,
      },
      {
        place: {
          placeId: null,
          name: 'KE723 인천 → 간사이',
          address: null,
          location: null,
          fetchedAt: null,
        },
        time: '09:00',
        memo: '',
        flight: {
          number: 'KE723',
          airline: 'Korean Air',
          departure: { code: 'ICN', name: '인천', time: '09:00', terminal: '2' },
          arrival: { code: 'KIX', name: '간사이', time: '10:55', terminal: 'T1', dayOffset: 0 },
        },
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
        flight: null,
      },
    ]);
  });

  it('name airports they don’t know as the flight data does', () => {
    const [, flight, arrival] = flightItems(leg({ iata: 'XYZ', name: 'Somewhere', terminal: null }));
    expect(arrival.place.name).toBe('Somewhere 공항 (XYZ)');
    expect(flight.place.name).toBe('KE723 인천 → Somewhere');
    expect(flight.flight?.arrival).toMatchObject({ code: 'XYZ', name: 'Somewhere' });
  });

  it('are at their airports without a point, or a code, when the data has none', () => {
    expect(flightItems(leg({ location: null }))[2].place.location).toBeNull();
    expect(airportPlaceName({ ...KANSAI, iata: null })).toBe('Osaka Kansai 공항');
    expect(scheduleFlight(leg({ iata: null })).arrival.code).toBeNull();
    // Not a code the app keeps.
    expect(scheduleFlight(leg({ iata: 'kix?' })).arrival.code).toBeNull();
  });

  it('count the days it lands after it leaves', () => {
    const days = (arrival: Partial<FlightEnd>) => scheduleFlight(leg(arrival)).arrival.dayOffset;
    expect(days({ date: '2026-12-02', time: '06:30' })).toBe(1);
    expect(days({ date: '2026-12-03' })).toBe(2);
    // Over the date line eastward: the day before.
    expect(days({ date: '2026-11-30' })).toBe(-1);
    expect(days({ date: null })).toBe(0);
  });
});

describe('the flight on its card', () => {
  const flight = scheduleFlight(leg());

  it('heads it with where and when it leaves and lands, the day it lands if another', () => {
    expect(flightHeading(flight, '09:00')).toBe('ICN 09:00 → KIX 10:55');
    // The item's time, as edited.
    expect(flightHeading(flight, '09:30')).toBe('ICN 09:30 → KIX 10:55');
    expect(flightHeading(flight, null)).toBe('ICN → KIX 10:55');
    const late = scheduleFlight(leg({ date: '2026-12-02', time: '00:40' }));
    expect(flightHeading(late, '23:10')).toBe('ICN 23:10 → KIX 00:40(+1일)');
    const honolulu = scheduleFlight(leg({ iata: 'HNL', date: '2026-11-30', time: '10:00' }));
    expect(flightHeading(honolulu, '21:00')).toBe('ICN 21:00 → HNL 10:00(-1일)');
    // An airport without a code goes by name.
    const somewhere = scheduleFlight(leg({ iata: null, name: 'Somewhere', time: null }));
    expect(flightHeading(somewhere, '09:00')).toBe('ICN 09:00 → Somewhere');
  });

  it('says the airline, the number and the terminal it leaves from', () => {
    expect(flightDetails(flight)).toBe('대한항공 · KE723 · T2 출발');
    expect(flightDetails(scheduleFlight({ ...leg({}, { terminal: null }), airline: null }))).toBe(
      '대한항공 · KE723',
    );
    expect(flightWay(flight)).toBe('인천 T2 출발 → 간사이 T1 도착');
    expect(flightWay(scheduleFlight(leg({ terminal: null })))).toBe('인천 T2 출발 → 간사이 도착');
  });
});

describe('airlineName', () => {
  it('is the Korean name of an airline it knows, the flight data’s otherwise', () => {
    expect(airlineName({ number: 'KE723', airline: 'Korean Air' })).toBe('대한항공');
    expect(airlineName({ number: '7C1301', airline: 'Jeju Air' })).toBe('제주항공');
    expect(airlineName({ number: 'TK2004', airline: null })).toBe('터키항공');
    expect(airlineName({ number: 'XQ123', airline: 'SunExpress' })).toBe('SunExpress');
    // By its ICAO code: the data's name.
    expect(airlineName({ number: 'KAL723', airline: 'Korean Air' })).toBe('Korean Air');
    expect(airlineName({ number: 'XQ123', airline: null })).toBeNull();
  });
});

describe('isFlightItem', () => {
  it('is an item looked up as a flight, or named by its flight alone without a place', () => {
    const [airport, flight] = flightItems(leg());
    expect(isFlightItem(flight)).toBe(true);
    expect(isFlightItem(airport)).toBe(false);
    expect(isFlightItem({ place: namedPlace('KE723'), flight: null })).toBe(true);
    expect(isFlightItem({ place: namedPlace('KE723 인천 → 간사이'), flight: null })).toBe(true);
    expect(isFlightItem({ place: namedPlace('오사카성'), flight: null })).toBe(false);
    // Found as a place: a place.
    expect(isFlightItem({ place: makePlace('KE723'), flight: null })).toBe(false);
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
      flight: null,
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

describe('withoutFlightMemo', () => {
  it('takes out what the app wrote about the flight, and keeps the rest', () => {
    // The memo of the airport it left from.
    const memo = 'KE723 인천 → 간사이 · Korean Air\n인천 T2 출발 → 간사이 T1 도착 10:55';
    expect(withoutFlightMemo(memo, leg())).toBe('');
    expect(withoutFlightMemo(`${memo}\n좌석 32A`, leg())).toBe('좌석 32A');
    // Landing at another time by now.
    expect(withoutFlightMemo(`${memo}\n좌석 32A`, leg({ time: '11:10' }))).toBe('좌석 32A');
    // The one line it was before that, the next day's time written out.
    const before = 'Korean Air · 인천 T2 출발 → 간사이 T1 도착 다음 날 00:20';
    expect(withoutFlightMemo(`${before}\n좌석 32A`, leg({ date: '2026-12-02' }))).toBe('좌석 32A');
  });

  it('leaves a memo without it as it is, and another flight’s', () => {
    expect(withoutFlightMemo(' 좌석 32A ', leg())).toBe(' 좌석 32A ');
    const jin = 'LJ201 인천 → 간사이 · Jin Air\n인천 T2 출발 → 간사이 T1 도착 10:55';
    expect(withoutFlightMemo(jin, leg())).toBe(jin);
  });
});
