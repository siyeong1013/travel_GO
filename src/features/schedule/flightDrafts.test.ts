import { describe, expect, it } from 'vitest';
import {
  answered,
  asking,
  awaitingLookup,
  chosenLeg,
  currentLookup,
  type FlightDraft,
  flightScheduleItems,
  foundLegs,
} from '@/features/schedule/flightDrafts';
import type { FlightLeg } from '@/lib/flights';

const POINTS: Record<string, { lat: number; lng: number }> = {
  ICN: { lat: 37.46, lng: 126.44 },
  KIX: { lat: 34.43, lng: 135.24 },
  NRT: { lat: 35.76, lng: 140.39 },
};

function leg(number: string, from: [string, string], to: [string, string], date = '2026-11-10'): FlightLeg {
  const end = ([iata, countryCode]: [string, string], time: string) => ({
    iata,
    name: iata,
    countryCode,
    location: POINTS[iata] ?? null,
    date,
    time,
    terminal: null,
  });
  return { number, airline: 'Korean Air', departure: end(from, '09:00'), arrival: end(to, '11:00') };
}

const found = (key: number, number: string, date: string, legs: FlightLeg[]): FlightDraft => ({
  key,
  number,
  date,
  lookup: { number, date, result: { status: 'ok', flights: legs } },
  leg: 0,
});

const OUT = found(1, 'KE723', '2026-11-10', [leg('KE723', ['ICN', 'KR'], ['KIX', 'JP'])]);
const BACK = found(2, 'KE724', '2026-11-12', [leg('KE724', ['KIX', 'JP'], ['ICN', 'KR'], '2026-11-12')]);

describe('flights', () => {
  it('count as found for the number and day they were looked up for', () => {
    expect(foundLegs(OUT)).toHaveLength(1);
    expect(foundLegs({ ...OUT, number: 'ke 723' })).toHaveLength(1);
    expect(foundLegs({ ...OUT, number: 'KE724' })).toEqual([]);
    expect(foundLegs({ ...OUT, date: '2026-11-11' })).toEqual([]);
    expect(foundLegs({ ...OUT, lookup: { number: 'KE723', date: '2026-11-10', result: null } })).toEqual([]);
  });

  it('go into the schedule on the day they leave, or the inbox outside the trip', () => {
    const trip = { id: 'trip', startDate: '2026-11-10', endDate: '2026-11-12' };
    const early = found(3, 'KE721', '2026-11-09', [leg('KE721', ['ICN', 'KR'], ['NRT', 'JP'], '2026-11-09')]);
    const typed: FlightDraft = { key: 4, number: 'oz 112', date: '2026-11-11', lookup: null, leg: 0 };
    const junk: FlightDraft = { key: 5, number: '여권 챙기기', date: '2026-11-11', lookup: null, leg: 0 };

    const items = flightScheduleItems([OUT, early, typed, junk], trip);
    // Each found: the airport it leaves from, the flight, then the airport it lands at.
    expect(items.map((item) => [item.date, item.place.name, item.time])).toEqual([
      ['2026-11-10', '인천 공항 (ICN)', '09:00'],
      ['2026-11-10', 'KE723 인천 → 간사이', '09:00'],
      ['2026-11-10', '간사이 공항 (KIX)', '11:00'],
      [null, '인천 공항 (ICN)', '09:00'],
      [null, 'KE721 인천 → 나리타', '09:00'],
      [null, '나리타 공항 (NRT)', '11:00'],
      ['2026-11-11', 'OZ112', null],
    ]);
    expect(items.map((item) => item.flight?.number ?? null)).toEqual([
      null,
      'KE723',
      null,
      null,
      'KE721',
      null,
      null,
    ]);
    expect(items.map((item) => item.memo)).toEqual(['', '', '', '', '', '', '']);
    expect(items[2]!.place).toEqual({
      placeId: null,
      name: '간사이 공항 (KIX)',
      address: null,
      location: POINTS.KIX,
      fetchedAt: null,
    });
    expect(items[6]!.place).toEqual({
      placeId: null,
      name: 'OZ112',
      address: null,
      location: null,
      fetchedAt: null,
    });
  });

  it('are both airports there and back, on the days they leave', () => {
    const trip = { id: 'trip', startDate: '2026-11-10', endDate: '2026-11-12' };
    const items = flightScheduleItems([OUT, BACK], trip);
    expect(items.map((item) => [item.date, item.place.name, item.place.location])).toEqual([
      ['2026-11-10', '인천 공항 (ICN)', POINTS.ICN],
      ['2026-11-10', 'KE723 인천 → 간사이', null],
      ['2026-11-10', '간사이 공항 (KIX)', POINTS.KIX],
      ['2026-11-12', '간사이 공항 (KIX)', POINTS.KIX],
      ['2026-11-12', 'KE724 간사이 → 인천', null],
      ['2026-11-12', '인천 공항 (ICN)', POINTS.ICN],
    ]);
  });
});

describe('a flight of several legs', () => {
  // Through Tokyo, one number all the way.
  const through = found(1, 'KE001', '2026-11-10', [
    leg('KE001', ['ICN', 'KR'], ['NRT', 'JP']),
    leg('KE001', ['NRT', 'JP'], ['HNL', 'US']),
  ]);
  const trip = { id: 'trip', startDate: '2026-11-10', endDate: '2026-11-15' };

  it('goes in as the leg picked, the first to begin with', () => {
    expect(chosenLeg(through)?.arrival.iata).toBe('NRT');
    expect(chosenLeg({ ...through, leg: 1 })?.arrival.iata).toBe('HNL');
    expect(flightScheduleItems([{ ...through, leg: 1 }], trip).map((item) => item.place.name)).toEqual([
      '나리타 공항 (NRT)',
      'KE001 나리타 → 호놀룰루',
      '호놀룰루 공항 (HNL)',
    ]);
    // A pick from an answer since replaced.
    expect(chosenLeg({ ...through, leg: 5 })?.arrival.iata).toBe('NRT');
  });

  it('starts from the first leg when asked again', () => {
    const asked = asking([{ ...through, leg: 1 }], 1, 'KE001', '2026-11-11');
    expect(asked[0]!.leg).toBe(0);
  });
});

describe('looking a row up', () => {
  const row: FlightDraft = { key: 1, number: 'ke 723', date: '2026-11-10', lookup: null, leg: 0 };
  const other: FlightDraft = { key: 2, number: 'KE724', date: '2026-11-12', lookup: null, leg: 0 };

  it('waits for an answer once there is a number and a day', () => {
    expect(awaitingLookup(row)).toBe(true);
    expect(awaitingLookup({ ...row, number: '여권' })).toBe(false);
    expect(awaitingLookup({ ...row, date: '' })).toBe(false);
    const asked = asking([row], 1, 'KE723', '2026-11-10');
    expect(awaitingLookup(asked[0]!)).toBe(true);
    const done = answered(asked, 1, 'KE723', '2026-11-10', { status: 'signedOut' });
    expect(awaitingLookup(done[0]!)).toBe(false);
    // Typed further: waits again.
    expect(awaitingLookup({ ...done[0]!, number: 'KE7231' })).toBe(true);
  });

  it('asks for the row as it reads, and takes the answer', () => {
    const asked = asking([row, other], 1, 'KE723', '2026-11-10');
    expect(currentLookup(asked[0]!)).toEqual({ number: 'KE723', date: '2026-11-10', result: null });
    expect(asked[1]).toBe(other);
    const done = answered(asked, 1, 'KE723', '2026-11-10', { status: 'notFound' });
    expect(currentLookup(done[0]!)?.result).toEqual({ status: 'notFound' });
  });

  it('drops an answer for what the row no longer asks', () => {
    const asked = asking([row], 1, 'KE723', '2026-11-10');
    const again = asking(asked, 1, 'KE723', '2026-11-11');
    expect(answered(again, 1, 'KE723', '2026-11-10', { status: 'notFound' })).toEqual(again);
    // Another number or day typed since: the answer is old.
    expect(currentLookup({ ...asked[0]!, number: 'KE725' })).toBeNull();
    expect(currentLookup({ ...asked[0]!, date: '2026-11-11' })).toBeNull();
  });
});
