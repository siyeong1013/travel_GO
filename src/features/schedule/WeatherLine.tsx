import type { ComponentType, SVGProps } from 'react';
import {
  CloudIcon,
  CloudLightningIcon,
  CloudRainIcon,
  CloudSnowIcon,
  CloudSunIcon,
  SunIcon,
  WindIcon,
} from '@/components/ui/icons';
import {
  precipitationText,
  temperatureText,
  type WeatherIconKind,
  weatherIconKind,
} from '@/features/schedule/weather';
import type { DayForecast } from '@/lib/weatherApi';

const ICONS: Record<WeatherIconKind, ComponentType<SVGProps<SVGSVGElement>>> = {
  sun: SunIcon,
  partly: CloudSunIcon,
  cloud: CloudIcon,
  rain: CloudRainIcon,
  snow: CloudSnowIcon,
  thunder: CloudLightningIcon,
  wind: WindIcon,
};

/** The icon of a forecast's condition, in the text's color. */
export function WeatherIcon({
  condition,
  ...props
}: { condition: string } & SVGProps<SVGSVGElement>) {
  const Icon = ICONS[weatherIconKind(condition)];
  return <Icon {...props} />;
}

/**
 * Under the day tabs: the selected day's weather (`맑음 · 2° / 11° · 비 30%`), and what the terms
 * ask to show next to weather data, there as long as any tab shows some.
 */
export function WeatherLine({ day, attributions }: { day?: DayForecast; attributions: string[] }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 pb-2">
      {day && (
        <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-gray-700">
          <WeatherIcon condition={day.condition} width={16} height={16} className="shrink-0" />
          <span className="truncate">
            {[day.description, temperatureText(day), precipitationText(day.precipitation)]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </p>
      )}
      <p translate="no" className="ml-auto text-right text-[11px] leading-snug text-gray-500">
        {attributions.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </p>
    </div>
  );
}
