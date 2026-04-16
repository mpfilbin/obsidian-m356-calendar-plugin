import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WeatherCacheService } from '../../src/services/WeatherCacheService';
import { DailyWeather, WeatherCacheStore } from '../../src/types';
import { toDateOnly } from '../../src/lib/datetime';

const LOCATION = 'New York, US';
const UNITS = 'imperial' as const;
// Far future — always a forecast date (TTL: 1 hour)
const FORECAST_DATE = '2030-06-15';
// Far past — always a historical date (TTL: 24 hours)
const HISTORICAL_DATE = '2020-01-10';

const makeWeather = (date: string): DailyWeather => ({
  date,
  condition: { code: 800, description: 'clear sky', iconCode: '01d' },
  tempCurrent: 72,
  tempHigh: 78,
  tempLow: 61,
  precipProbability: 0.1,
});

describe('WeatherCacheService', () => {
  let load: ReturnType<typeof vi.fn>;
  let save: ReturnType<typeof vi.fn>;
  let cache: WeatherCacheService;

  beforeEach(async () => {
    load = vi.fn().mockResolvedValue({});
    save = vi.fn().mockResolvedValue(undefined);
    cache = new WeatherCacheService(load, save);
    await cache.init();
  });

  // --- get ---

  it('returns null on cache miss (no entry)', () => {
    expect(cache.get(FORECAST_DATE, LOCATION, UNITS)).toBeNull();
  });

  it('returns DailyWeather on forecast cache hit within 1 hour', async () => {
    const weather = makeWeather(FORECAST_DATE);
    await cache.set(FORECAST_DATE, LOCATION, weather, UNITS);
    expect(cache.get(FORECAST_DATE, LOCATION, UNITS)).toEqual(weather);
  });

  it('returns DailyWeather on historical cache hit within 24 hours', async () => {
    const weather = makeWeather(HISTORICAL_DATE);
    await cache.set(HISTORICAL_DATE, LOCATION, weather, UNITS);
    expect(cache.get(HISTORICAL_DATE, LOCATION, UNITS)).toEqual(weather);
  });

  it('returns null for expired forecast entry (older than 1 hour)', () => {
    const expiredStore: WeatherCacheStore = {
      [`${FORECAST_DATE}:${LOCATION}:${UNITS}`]: {
        data: makeWeather(FORECAST_DATE),
        fetchedAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
      },
    };
    const c = new WeatherCacheService(
      vi.fn().mockResolvedValue(expiredStore),
      vi.fn().mockResolvedValue(undefined),
    );
    // Don't call init so we bypass purge — test get() TTL directly
    // @ts-expect-error accessing private store for test setup
    c['store'] = expiredStore;
    expect(c.get(FORECAST_DATE, LOCATION, UNITS)).toBeNull();
  });

  it('returns null for expired historical entry (older than 24 hours)', () => {
    const expiredStore: WeatherCacheStore = {
      [`${HISTORICAL_DATE}:${LOCATION}:${UNITS}`]: {
        data: makeWeather(HISTORICAL_DATE),
        fetchedAt: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
      },
    };
    const c = new WeatherCacheService(vi.fn().mockResolvedValue(expiredStore), vi.fn().mockResolvedValue(undefined));
    // @ts-expect-error accessing private store for test setup
    c['store'] = expiredStore;
    expect(c.get(HISTORICAL_DATE, LOCATION, UNITS)).toBeNull();
  });

  it('returns fresh historical entry that is within 24 hours', async () => {
    const weather = makeWeather(HISTORICAL_DATE);
    await cache.set(HISTORICAL_DATE, LOCATION, weather, UNITS);
    expect(cache.get(HISTORICAL_DATE, LOCATION, UNITS)).toEqual(weather);
  });

  it('returns null for different location than what was stored', async () => {
    await cache.set(FORECAST_DATE, LOCATION, makeWeather(FORECAST_DATE), UNITS);
    expect(cache.get(FORECAST_DATE, 'London, GB', UNITS)).toBeNull();
  });

  it('returns null for different units than what was stored', async () => {
    await cache.set(FORECAST_DATE, LOCATION, makeWeather(FORECAST_DATE), 'imperial');
    expect(cache.get(FORECAST_DATE, LOCATION, 'metric')).toBeNull();
  });

  // --- set ---

  it('set persists via save', async () => {
    await cache.set(FORECAST_DATE, LOCATION, makeWeather(FORECAST_DATE), UNITS);
    expect(save).toHaveBeenCalled();
  });

  it('set overwrites existing entry for same date+location+units', async () => {
    const weather1 = makeWeather(FORECAST_DATE);
    const weather2 = { ...makeWeather(FORECAST_DATE), condition: { code: 500, description: 'rain', iconCode: '10d' } };
    await cache.set(FORECAST_DATE, LOCATION, weather1, UNITS);
    await cache.set(FORECAST_DATE, LOCATION, weather2, UNITS);
    expect(cache.get(FORECAST_DATE, LOCATION, UNITS)!.condition.code).toBe(500);
  });

  // --- clearAll ---

  it('clearAll empties the store and persists via save', async () => {
    await cache.set(FORECAST_DATE, LOCATION, makeWeather(FORECAST_DATE), UNITS);
    await cache.clearAll();
    expect(cache.get(FORECAST_DATE, LOCATION, UNITS)).toBeNull();
    expect(save).toHaveBeenLastCalledWith({});
  });

  // --- init / purgeExpired ---

  it('init purges stale forecast entries (> 1 hour old)', async () => {
    const staleStore: WeatherCacheStore = {
      [`${FORECAST_DATE}:${LOCATION}:${UNITS}`]: {
        data: makeWeather(FORECAST_DATE),
        fetchedAt: Date.now() - 2 * 60 * 60 * 1000,
      },
    };
    const saveMock = vi.fn().mockResolvedValue(undefined);
    const c = new WeatherCacheService(vi.fn().mockResolvedValue(staleStore), saveMock);
    await c.init();
    expect(c.get(FORECAST_DATE, LOCATION, UNITS)).toBeNull();
  });

  it('init persists the store after purging stale entries', async () => {
    const staleStore: WeatherCacheStore = {
      [`${FORECAST_DATE}:${LOCATION}:${UNITS}`]: {
        data: makeWeather(FORECAST_DATE),
        fetchedAt: Date.now() - 2 * 60 * 60 * 1000,
      },
    };
    const saveMock = vi.fn().mockResolvedValue(undefined);
    const c = new WeatherCacheService(vi.fn().mockResolvedValue(staleStore), saveMock);
    await c.init();
    expect(saveMock).toHaveBeenCalledWith({});
  });

  it('init does not call save when no entries were purged', async () => {
    const freshStore: WeatherCacheStore = {
      [`${FORECAST_DATE}:${LOCATION}:${UNITS}`]: {
        data: makeWeather(FORECAST_DATE),
        fetchedAt: Date.now() - 30 * 60 * 1000, // 30 minutes ago — fresh
      },
    };
    const saveMock = vi.fn().mockResolvedValue(undefined);
    const c = new WeatherCacheService(vi.fn().mockResolvedValue(freshStore), saveMock);
    await c.init();
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('init keeps fresh forecast entries (< 1 hour old)', async () => {
    const freshStore: WeatherCacheStore = {
      [`${FORECAST_DATE}:${LOCATION}:${UNITS}`]: {
        data: makeWeather(FORECAST_DATE),
        fetchedAt: Date.now() - 30 * 60 * 1000, // 30 minutes ago
      },
    };
    const c = new WeatherCacheService(vi.fn().mockResolvedValue(freshStore), vi.fn().mockResolvedValue(undefined));
    await c.init();
    expect(c.get(FORECAST_DATE, LOCATION, UNITS)).not.toBeNull();
  });

  it('init keeps fresh historical entries (< 24 hours old)', async () => {
    const freshStore: WeatherCacheStore = {
      [`${HISTORICAL_DATE}:${LOCATION}:${UNITS}`]: {
        data: makeWeather(HISTORICAL_DATE),
        fetchedAt: Date.now() - 12 * 60 * 60 * 1000, // 12 hours ago
      },
    };
    const c = new WeatherCacheService(vi.fn().mockResolvedValue(freshStore), vi.fn().mockResolvedValue(undefined));
    await c.init();
    expect(c.get(HISTORICAL_DATE, LOCATION, UNITS)).not.toBeNull();
  });

  it('treats today as a forecast date (1-hour TTL, not 24-hour)', () => {
    const today = toDateOnly(new Date());
    const expiredForForecast: WeatherCacheStore = {
      [`${today}:${LOCATION}:${UNITS}`]: {
        data: makeWeather(today),
        fetchedAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago — expired under 1h TTL
      },
    };
    const c = new WeatherCacheService(vi.fn().mockResolvedValue(expiredForForecast), vi.fn().mockResolvedValue(undefined));
    // @ts-expect-error accessing private store for test setup
    c['store'] = expiredForForecast;
    expect(c.get(today, LOCATION, UNITS)).toBeNull(); // expired under 1-hour forecast TTL
  });
});
