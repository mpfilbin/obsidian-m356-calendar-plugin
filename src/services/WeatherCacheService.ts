import { WeatherCacheStore, DailyWeather } from '../types';

const FORECAST_TTL_MS = 60 * 60 * 1000;          // 1 hour
const HISTORICAL_TTL_MS = 24 * 60 * 60 * 1000;   // 24 hours

function isForecastDate(dateStr: string): boolean {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date >= today;
}

function cacheKey(date: string, location: string): string {
  return `${date}:${location}`;
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
    this.purgeExpired();
  }

  get(date: string, location: string): DailyWeather | null {
    const entry = this.store[cacheKey(date, location)];
    if (!entry) return null;
    const ttl = isForecastDate(date) ? FORECAST_TTL_MS : HISTORICAL_TTL_MS;
    if (Date.now() - entry.fetchedAt > ttl) return null;
    return entry.data;
  }

  async set(date: string, location: string, data: DailyWeather): Promise<void> {
    this.store[cacheKey(date, location)] = { data, fetchedAt: Date.now() };
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
