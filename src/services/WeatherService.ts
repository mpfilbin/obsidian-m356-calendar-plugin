import { DailyWeather } from '../types';
import { WeatherCacheService } from './WeatherCacheService';
import { Semaphore } from '../lib/semaphore';
import { toDateOnly } from '../lib/datetime';
import { fetchWithRetry } from '../lib/fetchWithRetry';

const GEO_BASE = 'https://api.openweathermap.org/geo/1.0/direct';
const OWM_BASE = 'https://api.openweathermap.org/data/3.0/onecall';

interface Coords { lat: number; lon: number }

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day); // local midnight — avoids UTC-parse offset bug
}

export class WeatherService {
  private readonly semaphore = new Semaphore(2);
  private geocache: { location: string; lat: number; lon: number } | null = null;

  constructor(
    private readonly getApiKey: () => string,
    private readonly getLocation: () => string,
    private readonly getUnits: () => 'imperial' | 'metric',
    private readonly cache: WeatherCacheService,
  ) {}

  async getWeatherForDates(dates: string[]): Promise<Map<string, DailyWeather | null>> {
    const result = new Map<string, DailyWeather | null>();
    const apiKey = this.getApiKey();
    const location = this.getLocation();
    const units = this.getUnits();

    if (!apiKey || !location || dates.length === 0) {
      for (const date of dates) result.set(date, null);
      return result;
    }

    // Serve from cache where possible
    const uncached: string[] = [];
    for (const date of dates) {
      const cached = this.cache.get(date, location, units);
      if (cached !== null) {
        result.set(date, cached);
      } else {
        uncached.push(date);
      }
    }
    if (uncached.length === 0) return result;

    // Geocode
    let coords: Coords | null;
    try {
      coords = await this.getCoordinates(apiKey, location);
    } catch {
      for (const date of uncached) result.set(date, null);
      return result;
    }
    if (!coords) {
      for (const date of uncached) result.set(date, null);
      return result;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Only fetch forecast dates (today + up to 8 days ahead); historical dates are omitted
    // from the result map so no weather indicator is shown for past dates.
    const forecastDates = uncached.filter((d) => parseLocalDate(d) >= today);

    if (forecastDates.length > 0) {
      try {
        const fetched = await this.fetchForecast(apiKey, coords, location);
        for (const [date, weather] of fetched) {
          if (forecastDates.includes(date)) result.set(date, weather);
        }
      } catch {
        // fall through to null-fill below
      }
      for (const date of forecastDates) {
        if (!result.has(date)) result.set(date, null);
      }
    }

    return result;
  }

  private async getCoordinates(apiKey: string, location: string): Promise<Coords | null> {
    if (this.geocache?.location === location) {
      return { lat: this.geocache.lat, lon: this.geocache.lon };
    }
    const url = `${GEO_BASE}?q=${encodeURIComponent(location)}&limit=1&appid=${apiKey}`;
    const response = await fetchWithRetry(url, {});
    if (!response.ok) return null;
    const data = await response.json() as Array<{ lat: number; lon: number }>;
    if (!data.length) return null;
    this.geocache = { location, lat: data[0].lat, lon: data[0].lon };
    return { lat: data[0].lat, lon: data[0].lon };
  }

  private async fetchForecast(apiKey: string, coords: Coords, location: string): Promise<Map<string, DailyWeather>> {
    const units = this.getUnits();
    const url = `${OWM_BASE}?lat=${coords.lat}&lon=${coords.lon}&exclude=minutely,hourly,alerts&appid=${apiKey}&units=${units}`;

    await this.semaphore.acquire();
    let response: Response;
    try {
      response = await fetchWithRetry(url, {});
    } finally {
      this.semaphore.release();
    }
    if (!response.ok) throw new Error(`Weather forecast error: ${response.statusText}`);

    const data = await response.json() as {
      current: { temp: number; weather: Array<{ id: number; description: string; icon: string }> };
      daily: Array<{
        dt: number;
        temp: { day: number; min: number; max: number };
        pop: number;
        weather: Array<{ id: number; description: string; icon: string }>;
      }>;
    };

    const todayStr = toDateOnly(new Date());
    const result = new Map<string, DailyWeather>();
    for (const day of data.daily) {
      // day.dt is approximately noon local time in the weather location's timezone.
      // Converting directly to a local Date gives the correct calendar date without offset tricks.
      const date = toDateOnly(new Date(day.dt * 1000));
      const isToday = date === todayStr;
      const weather: DailyWeather = {
        date,
        condition: { code: day.weather[0].id, description: day.weather[0].description, iconCode: day.weather[0].icon },
        tempCurrent: isToday ? data.current.temp : day.temp.day,
        tempHigh: day.temp.max,
        tempLow: day.temp.min,
        precipProbability: day.pop,
      };
      result.set(date, weather);
      await this.cache.set(date, location, weather, units);
    }
    return result;
  }

}
