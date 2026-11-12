import { useEffect } from 'react';
import type { LocalDate, ScheduleItem, Trip } from '@/data/models';
import { daySpots, spotKey, weatherAttributions } from '@/features/schedule/weather';
import { useWeatherStore, weatherStore } from '@/features/schedule/weatherStore';
import { addDays } from '@/lib/dates';
import { googleMapsApiKey } from '@/lib/googleMaps';
import { useOnline } from '@/lib/useOnline';
import { type DayForecast, FORECAST_DAYS } from '@/lib/weatherApi';

export interface TripWeather {
  /** The forecast of each day that has one: from today to about ten days ahead. */
  days: ReadonlyMap<LocalDate, DayForecast>;
  /** What to show next to it (`weatherAttributions`); empty when no day has weather. */
  attributions: string[];
}

/**
 * The trip's weather day by day, where each day is (`daySpots`), from Google's Weather API with
 * the map's key. Only days within the forecast's reach ask for it: nothing for a trip months away.
 */
export function useTripWeather(trip: Trip, items: ScheduleItem[], today: LocalDate): TripWeather {
  const online = useOnline();
  const hasKey = googleMapsApiKey() !== '';
  // A spot's today can be a day behind ours (time zones); the forecast goes ten days from it.
  const from = addDays(today, -1);
  const to = addDays(today, FORECAST_DAYS);
  const spots = [...daySpots(trip, items)]
    .filter(([date]) => date >= from && date <= to)
    .map(([date, spot]) => [date, spotKey(spot)] as const);
  const keys = [...new Set(spots.map(([, key]) => key))].sort().join(' ');
  const forecasts = useWeatherStore((state) => state.forecasts);

  useEffect(() => {
    if (hasKey && keys) void weatherStore.getState().load(keys.split(' '));
  }, [hasKey, keys, online]);

  const days = new Map<LocalDate, DayForecast>();
  const zones = new Set<string | null>();
  for (const [date, key] of spots) {
    const forecast = forecasts[key];
    const day = forecast?.days.find((d) => d.date === date);
    if (!forecast || !day) continue;
    days.set(date, day);
    zones.add(forecast.timeZone);
  }
  return { days, attributions: days.size > 0 ? weatherAttributions([...zones]) : [] };
}
