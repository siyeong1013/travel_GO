import { describe, expect, it } from 'vitest';
import { arrivalText, flightItem, withFlightMemo } from '@/features/schedule/flightItem';
import type { FlightLeg } from '@/lib/flights';

const leg = (arrival: Partial<FlightLeg['arrival']> = {}): FlightLeg => ({
  number: 'KE723',
  airline: 'Korean Air',
  departure: { iata: 'ICN', name: 'Incheon', countryCode: 'KR', location: null, date: '2026-12-01', time: '09:00', terminal: '2' },
  arrival: {
    iata: 'KIX',
    name: 'Osaka Kansai',
    countryCode: 'JP',
    location: null,
    date: '2026-12-01',
    time: '10:55',
    terminal: 'T1',
    ...arrival,
  },
});

describe('flightItem', () => {
  it('goes in at its departure time, with the airports in Korean', () => {
    expect(flightItem(leg())).toEqual({
      name: 'KE723 인천 → 간사이',
      time: '09:00',
      memo: 'Korean Air · 인천 T2 출발 → 간사이 T1 도착 10:55',
    });
  });

  it('names airports it doesn’t know as the flight data does', () => {
    expect(flightItem(leg({ iata: 'XYZ', name: 'Somewhere', terminal: null })).name).toBe(
      'KE723 인천 → Somewhere',
    );
  });

  it('says when it lands on another day', () => {
    expect(arrivalText(leg({ date: '2026-12-02', time: '06:30' }))).toBe('다음 날 06:30');
    expect(arrivalText(leg({ date: '2026-12-03', time: '06:30' }))).toMatch(/^12\.3 .* 06:30$/);
    expect(arrivalText(leg({ time: null }))).toBe('');
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
