import { useState, useEffect, useCallback, useRef } from 'react';
import { DailyWeather, M365CalendarSettings, ViewType } from '../types';
import { useAppContext } from '../context';
import { getDateRange, getDatesInRange } from '../lib/datetime';

/** Loads weather for the visible range; refetches on settings change or weather-cache clear. */
export function useWeather(settings: M365CalendarSettings, currentDate: Date, view: ViewType) {
  const { weatherService, subscribeWeatherRefresh } = useAppContext();
  const [weather, setWeather] = useState<Map<string, DailyWeather | null>>(new Map());
  const requestRef = useRef(0);

  const fetchWeather = useCallback(async () => {
    if (!settings.weatherEnabled) {
      requestRef.current++;
      setWeather(new Map());
      return;
    }
    const requestId = ++requestRef.current;
    const { start, end } = getDateRange(currentDate, view);
    const dates = getDatesInRange(start, end);
    try {
      const result = await weatherService.getWeatherForDates(dates);
      if (requestId === requestRef.current) setWeather(result);
    } catch {
      if (requestId === requestRef.current) setWeather(new Map(dates.map((d) => [d, null])));
    }
  }, [weatherService, settings.weatherEnabled, settings.weatherLocation, settings.openWeatherApiKey, settings.weatherUnits, currentDate, view]);

  // Keep a ref to the latest fetchWeather so the subscribed callback never goes stale.
  const fetchWeatherRef = useRef(fetchWeather);
  useEffect(() => { fetchWeatherRef.current = fetchWeather; }, [fetchWeather]);
  useEffect(
    () => subscribeWeatherRefresh(() => void fetchWeatherRef.current()),
    [subscribeWeatherRefresh],
  );

  useEffect(() => {
    void fetchWeather();
  }, [fetchWeather]);

  return { weather, fetchWeather };
}
