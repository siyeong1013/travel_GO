import { describe, expect, it } from 'vitest';
import type { GeoPoint, ScheduleItem } from '@/data/models';
import { flightItems } from '@/features/schedule/flightItem';
import {
  daySpots,
  keySpot,
  precipitationText,
  spotKey,
  temperatureText,
  weatherAttributions,
  weatherIconKind,
  weatherLabel,
} from '@/features/schedule/weather';
import type { FlightLeg } from '@/lib/flights';
import { makeItem, makePlace, makeTrip, namedPlace, typedCity } from '@/test/fixtures';

const ISTANBUL = { lat: 41.0369, lng: 28.9858 };
const GOREME = { lat: 38.6431, lng: 34.8289 };
const SEOUL_HOTEL = { lat: 37.5665, lng: 126.978 };

const trip = makeTrip({
  startDate: '2026-11-10',
  endDate: '2026-11-14',
  cities: [{ name: '이스탄불', placeId: 'place-istanbul', location: ISTANBUL, fetchedAt: null }],
});

let order = 0;
const at = (date: string, name: string, location: GeoPoint | null): ScheduleItem =>
  makeItem({
    tripId: trip.id,
    date,
    order: order++,
    place: location ? makePlace(name, { location }) : namedPlace(name),
  });

const end = (iata: string, location: GeoPoint, time: string) => ({
  iata,
  name: iata,
  countryCode: null,
  location,
  date: '2026-11-12',
  time,
  terminal: null,
});
/** Istanbul to Cappadocia (Nevşehir), Day 3. */
const TK2004: FlightLeg = {
  number: 'TK2004',
  airline: 'Turkish Airlines',
  departure: end('IST', { lat: 41.2753, lng: 28.7519 }, '08:00'),
  arrival: end('NAV', { lat: 38.7719, lng: 34.5345 }, '09:20'),
};
const flight = (date: string, leg: FlightLeg) =>
  flightItems(leg).map((made) => makeItem({ tripId: trip.id, date, order: order++, ...made }));

describe('daySpots', () => {
  it('follows where each day ends, past airports, and carries it over days without places', () => {
    const items = [
      at('2026-11-10', '탁심광장', ISTANBUL),
      // Moving on: the airports don't count, the cave hotel does.
      at('2026-11-12', '호텔 체크아웃', ISTANBUL),
      ...flight('2026-11-12', TK2004),
      at('2026-11-12', '괴레메 동굴 호텔', GOREME),
      at('2026-11-13', '열기구', null),
    ];
    const spots = daySpots(trip, items);
    expect(Object.fromEntries(spots)).toEqual({
      '2026-11-10': ISTANBUL,
      '2026-11-11': ISTANBUL, // nothing that day: where the day before ended
      '2026-11-12': GOREME,
      '2026-11-13': GOREME, // a place without a location: still there
      '2026-11-14': GOREME,
    });
  });

  it("starts at the trip's first city, and stays put on a day of airports only", () => {
    const items = [...flight('2026-11-14', TK2004)];
    const spots = daySpots(trip, items);
    expect(spots.get('2026-11-10')).toEqual(ISTANBUL);
    expect(spots.get('2026-11-14')).toEqual(ISTANBUL);
  });

  it('lands with the first flight when nothing came before it, or has nothing to go by', () => {
    const typed = { ...trip, cities: [typedCity('이스탄불')] };
    expect(daySpots(typed, []).size).toBe(0);
    const spots = daySpots(typed, flight('2026-11-12', TK2004));
    expect(spots.has('2026-11-11')).toBe(false);
    expect(spots.get('2026-11-12')).toEqual(TK2004.arrival.location);
    expect(spots.get('2026-11-13')).toEqual(TK2004.arrival.location);
  });

  it('rounds spots to 0.1° (about 10km): the places of a city share a forecast', () => {
    expect(spotKey(ISTANBUL)).toBe('41.0,29.0');
    expect(spotKey({ lat: 41.0412, lng: 28.9611 })).toBe('41.0,29.0');
    expect(spotKey(SEOUL_HOTEL)).toBe('37.6,127.0');
    expect(keySpot('37.6,127.0')).toEqual({ lat: 37.6, lng: 127 });
  });
});

describe('weather display', () => {
  it('picks an icon by what matters most in a condition', () => {
    expect(
      [
        'CLEAR',
        'MOSTLY_CLEAR',
        'PARTLY_CLOUDY',
        'MOSTLY_CLOUDY',
        'CLOUDY',
        'LIGHT_RAIN',
        'CHANCE_OF_SHOWERS',
        'WIND_AND_RAIN',
        'WINDY',
        'HEAVY_SNOW_STORM',
        'HAIL_SHOWERS',
        'THUNDERSHOWER',
        'TYPE_UNSPECIFIED',
        // Japan and South Korea only
        'CLEAR_BUT_LATER_TURNING_CLOUDY',
        'CLOUDY_PERIODICALLY_CLEAR',
        'CLEAR_WITH_BRIEF_RAIN_LATER',
        'CLEAR_BUT_LATER_TURNING_TO_RAIN_AND_SNOW_MAIN_CONSTITUENT_RAIN',
        'CLEAR_WITH_BRIEF_SNOW',
      ].map(weatherIconKind),
    ).toEqual([
      'sun',
      'sun',
      'partly',
      'cloud',
      'cloud',
      'rain',
      'rain',
      'rain',
      'wind',
      'snow',
      'snow',
      'thunder',
      'cloud',
      'partly',
      'partly',
      'rain',
      'rain',
      'snow',
    ]);
  });

  it('writes the low and the high, and the chance of what falls from 20%', () => {
    expect(temperatureText({ min: 2, max: 11 })).toBe('2° / 11°');
    expect(temperatureText({ min: null, max: 11 })).toBe('11°');
    expect(temperatureText({ min: null, max: null })).toBeNull();
    expect(precipitationText({ percent: 30, type: 'RAIN' })).toBe('비 30%');
    expect(precipitationText({ percent: 40, type: 'SNOW' })).toBe('눈 40%');
    expect(precipitationText({ percent: 60, type: 'RAIN_AND_SNOW' })).toBe('비·눈 60%');
    expect(precipitationText({ percent: 10, type: 'RAIN' })).toBeNull();
    expect(precipitationText(null)).toBeNull();
    const day = { date: '2026-11-10', condition: 'CLEAR', description: '맑음', max: 11, min: 2 };
    expect(weatherLabel({ ...day, precipitation: null })).toBe('맑음, 최고 11도');
  });

  it("names Google, and Weathernews for Japan's and South Korea's weather", () => {
    expect(weatherAttributions(['Europe/Istanbul', null])).toEqual([
      'Source: Includes weather data from Google.',
    ]);
    expect(weatherAttributions(['Asia/Tokyo', 'Asia/Seoul'])).toEqual([
      'Source: Includes weather data from Google.',
      '気象データ提供： 株式会社ウェザーニューズ',
      '날씨 정보 제공: 웨더뉴스',
    ]);
  });
});
