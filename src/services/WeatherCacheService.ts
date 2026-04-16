import { WeatherCacheStore, DailyWeather } from '../types';

export const WEATHER_CACHE_KEY = 'weatherCache';

const FORECAST_TTL_MS = 60 * 60 * 1000;          // 1 hour
const HISTORICAL_TTL_MS = 24 * 60 * 60 * 1000;   // 24 hours

function isForecastDate(dateStr: string): boolean {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day); // local midnight — avoids UTC-parse offset bug
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date >= today;
}

function cacheKey(date: string, location: string, units: 'imperial' | 'metric'): string {
  return `${date}:${location}:${units}`;
}

export class WeatherCacheService {
  private store: WeatherCacheStore = {};

  constructor(
    private readonly load: () => Promise<WeatherCacheStore>,
    private readonly save: (data: WeatherCacheStore) => Promise<void>,
  ) {}

  async init(): Promise<void> {
    const data = await this.load();
    this.store = data ?? {};
    const sizeBefore = Object.keys(this.store).length;
    this.purgeExpired();
    if (Object.keys(this.store).length !== sizeBefore) {
      await this.save(this.store);
    }
  }

  get(date: string, location: string, units: 'imperial' | 'metric'): DailyWeather | null {
    const entry = this.store[cacheKey(date, location, units)];
    if (!entry) return null;
    const ttl = isForecastDate(date) ? FORECAST_TTL_MS : HISTORICAL_TTL_MS;
    if (Date.now() - entry.fetchedAt > ttl) return null;
    return entry.data;
  }

  async set(date: string, location: string, data: DailyWeather, units: 'imperial' | 'metric'): Promise<void> {
    this.store[cacheKey(date, location, units)] = { data, fetchedAt: Date.now() };
    await this.save(this.store);
  }

  purgeExpired(): void {
    const now = Date.now();
    for (const key of Object.keys(this.store)) {
      const entry = this.store[key];
      const date = key.slice(0, 10);
      const ttl = isForecastDate(date) ? FORECAST_TTL_MS : HISTORICAL_TTL_MS;
      if (now - entry.fetchedAt > ttl) {
        delete this.store[key];
      }
    }
  }
}
