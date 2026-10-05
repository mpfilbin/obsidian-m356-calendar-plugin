import { DailyWeather } from '../types';
import { WeatherCacheService } from './WeatherCacheService';
import { Semaphore } from '../lib/semaphore';
import { toDateOnly } from '../lib/datetime';
import { fetchWithRetry } from '../lib/fetchWithRetry';
import { type Logger, NullLogger } from '../lib/logger';

const GEO_BASE = 'https://api.openweathermap.org/geo/1.0/direct';
const OWM_BASE = 'https://api.openweathermap.org/data/3.0/onecall';

interface Coords { lat: number; lon: number }

export interface WeatherTestResult { ok: boolean; message: string }

function unknownLocationMessage(location: string): string {
  return `OpenWeather could not find the location "${location}". Try "City, Country code", e.g. "London, GB".`;
}

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
    private readonly logger: Logger = new NullLogger(),
    /** Called with a user-facing explanation when weather can't be loaded; deduplicated. */
    private readonly onProblem: (message: string) => void = () => {},
  ) {}

  private lastProblem: string | null = null;

  private reportProblem(message: string): void {
    this.logger.log('[M365 Weather]', message);
    if (message === this.lastProblem) return;
    this.lastProblem = message;
    this.onProblem(message);
  }

  /** Describes a failed OpenWeather response without ever including the API key. */
  private async describeFailure(what: string, response: Response): Promise<string> {
    let detail = '';
    try {
      const body = await response.json() as { message?: string };
      if (body?.message) detail = `: ${body.message}`;
    } catch {
      // body wasn't JSON; the status alone will have to do
    }
    this.logger.log(`[M365 Weather] ${what} failed: HTTP ${response.status}${detail}`);
    if (response.status === 401) {
      return 'OpenWeather rejected the API key (HTTP 401). The One Call API 3.0 needs its own "One Call by Call" subscription, and new keys can take a couple of hours to activate.';
    }
    if (response.status === 429) {
      return 'OpenWeather rate limit reached (HTTP 429). Weather will retry on the next refresh.';
    }
    return `OpenWeather ${what} failed (HTTP ${response.status}${detail}).`;
  }

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
    } catch (e) {
      this.reportProblem(e instanceof Error ? e.message : 'Could not reach OpenWeather.');
      for (const date of uncached) result.set(date, null);
      return result;
    }
    if (!coords) {
      this.reportProblem(unknownLocationMessage(location));
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
        this.lastProblem = null;
      } catch (e) {
        this.reportProblem(e instanceof Error ? e.message : 'Could not reach OpenWeather.');
        // fall through to null-fill below
      }
      for (const date of forecastDates) {
        if (!result.has(date)) result.set(date, null);
      }
    }

    return result;
  }

  /**
   * Checks the configured key and location end to end (bypassing caches) and returns a
   * message suitable for showing to the user, including which place the location resolved to.
   */
  async testConnection(): Promise<WeatherTestResult> {
    const apiKey = this.getApiKey().trim();
    const location = this.getLocation().trim();
    if (!apiKey) return { ok: false, message: 'Enter an OpenWeather API key first.' };
    if (!location) return { ok: false, message: 'Enter a location first.' };
    try {
      const geoResponse = await fetchWithRetry(
        `${GEO_BASE}?q=${encodeURIComponent(location)}&limit=1&appid=${apiKey}`, {},
      );
      if (!geoResponse.ok) return { ok: false, message: await this.describeFailure('location lookup', geoResponse) };
      const places = await geoResponse.json() as Array<{ lat: number; lon: number; name: string; state?: string; country?: string }>;
      if (!places.length) return { ok: false, message: unknownLocationMessage(location) };
      const place = places[0];

      const forecastUrl = `${OWM_BASE}?lat=${place.lat}&lon=${place.lon}&exclude=minutely,hourly,daily,alerts&appid=${apiKey}`;
      const forecastResponse = await fetchWithRetry(forecastUrl, {});
      if (!forecastResponse.ok) {
        return { ok: false, message: await this.describeFailure('forecast request', forecastResponse) };
      }
      const resolved = [place.name, place.state, place.country].filter(Boolean).join(', ');
      return { ok: true, message: `Connected. Weather will be shown for ${resolved}.` };
    } catch (e) {
      this.logger.log('[M365 Weather] connection test failed:', e instanceof Error ? e.message : String(e));
      return { ok: false, message: 'Could not reach OpenWeather. Check your internet connection.' };
    }
  }

  private async getCoordinates(apiKey: string, location: string): Promise<Coords | null> {
    if (this.geocache?.location === location) {
      return { lat: this.geocache.lat, lon: this.geocache.lon };
    }
    const url = `${GEO_BASE}?q=${encodeURIComponent(location)}&limit=1&appid=${apiKey}`;
    const response = await fetchWithRetry(url, {});
    if (!response.ok) throw new Error(await this.describeFailure('location lookup', response));
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
    if (!response.ok) throw new Error(await this.describeFailure('forecast request', response));

    const data = await response.json() as {
      timezone_offset?: number;
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
      // day.dt is approximately noon in the weather location's timezone. Shift by the
      // location's UTC offset and read the UTC fields to get that location's calendar date,
      // which differs from the user's local date when they are many hours apart.
      // Without an offset, fall back to the user's local date.
      const date = data.timezone_offset !== undefined
        ? new Date((day.dt + data.timezone_offset) * 1000).toISOString().slice(0, 10)
        : toDateOnly(new Date(day.dt * 1000));
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
