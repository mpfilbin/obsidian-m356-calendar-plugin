# OpenWeather Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional per-day weather conditions (icon, temperatures, precipitation) to the month, week, and day calendar views using OpenWeather One Call API 3.0.

**Architecture:** A new `WeatherCacheService` (keyed by `"YYYY-MM-DD:location"`) and `WeatherService` (One Call 3.0 client) follow the exact same constructor/cache/semaphore/retry pattern as `CacheService`/`CalendarService`. `CalendarApp` fetches weather for the visible date range when enabled, passing a `Map<string, DailyWeather | null>` prop to all three views. Forecast dates (today + next 7 days) use the `/onecall` endpoint; historical dates use `/onecall/timemachine`.

**Tech Stack:** TypeScript, React 18, OpenWeather One Call API 3.0, Obsidian Plugin API, Vitest, jsdom, `@testing-library/react`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/types/index.ts` | Modify | Add `WeatherCondition`, `DailyWeather`, `WeatherCacheEntry`, `WeatherCacheStore`; extend `M365CalendarSettings` with weather fields |
| `src/services/WeatherCacheService.ts` | **Create** | Per-date weather cache: 1h TTL for forecast dates, 24h for historical |
| `src/services/WeatherService.ts` | **Create** | OpenWeather One Call API 3.0 client with geocoding, semaphore, 429 retry |
| `src/context.ts` | Modify | Add `weatherService: WeatherService` to `AppContextValue` |
| `src/main.ts` | Modify | Construct and wire `WeatherCacheService` and `WeatherService` |
| `src/settings.ts` | Modify | Add Weather settings section + extend `DEFAULT_SETTINGS` |
| `src/components/CalendarApp.tsx` | Modify | Add `weather` state, `fetchWeather` callback, pass prop to views |
| `src/components/MonthView.tsx` | Modify | Accept `weather` prop; render icon in upper-right of day cells |
| `src/components/WeekView.tsx` | Modify | Accept `weather` prop; render strip (icon + temps + precip) in day column headers |
| `src/components/DayView.tsx` | Modify | Accept `weather` prop; render banner row above timeline |
| `tests/services/WeatherCacheService.test.ts` | **Create** | Unit tests for cache hit/miss, dual TTL, purge |
| `tests/services/WeatherService.test.ts` | **Create** | Unit tests for fetch, cache integration, geocoding, 429 retry |
| `tests/components/CalendarApp.test.tsx` | Modify | Add weather fetch tests; update `makeContext` to include `weatherService` mock |

---

## Task 1: Add weather types and settings fields

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/settings.ts`

No tests — pure type and constant additions.

- [ ] **Step 1: Add weather types to `src/types/index.ts`**

Add after the `StoredTokens` interface:

```typescript
export interface WeatherCondition {
  code: number;          // OpenWeather condition code e.g. 800
  description: string;   // e.g. "clear sky"
  iconCode: string;      // e.g. "01d" — appended to CDN icon URL
}

export interface DailyWeather {
  date: string;                   // "YYYY-MM-DD" in local time
  condition: WeatherCondition;
  tempCurrent: number | null;     // null for historical dates (timemachine doesn't guarantee current)
  tempHigh: number | null;        // null for historical dates (timemachine doesn't return daily min/max)
  tempLow: number | null;         // null for historical dates
  precipProbability: number | null; // 0–1; null for historical dates
}

export interface WeatherCacheEntry {
  data: DailyWeather;
  fetchedAt: number;
}

export type WeatherCacheStore = Record<string, WeatherCacheEntry>; // key: "YYYY-MM-DD:location"
```

- [ ] **Step 2: Extend `M365CalendarSettings` in `src/types/index.ts`**

Replace the existing `M365CalendarSettings` interface with:

```typescript
export interface M365CalendarSettings {
  clientId: string;
  tenantId: string;
  enabledCalendarIds: string[];
  defaultCalendarId: string;
  refreshIntervalMinutes: number;
  defaultView: 'month' | 'week' | 'day';
  weatherEnabled: boolean;
  openWeatherApiKey: string;
  weatherLocation: string;
  weatherUnits: 'imperial' | 'metric';
}
```

- [ ] **Step 3: Extend `DEFAULT_SETTINGS` in `src/settings.ts`**

Replace the existing `DEFAULT_SETTINGS` object with:

```typescript
export const DEFAULT_SETTINGS: M365CalendarSettings = {
  clientId: '',
  tenantId: 'common',
  enabledCalendarIds: [],
  defaultCalendarId: '',
  refreshIntervalMinutes: 10,
  defaultView: 'month',
  weatherEnabled: false,
  openWeatherApiKey: '',
  weatherLocation: '',
  weatherUnits: 'imperial',
};
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/settings.ts
git commit -m "feat: add weather types and settings fields"
```

---

## Task 2: WeatherCacheService (TDD)

**Files:**
- Create: `tests/services/WeatherCacheService.test.ts`
- Create: `src/services/WeatherCacheService.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/services/WeatherCacheService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WeatherCacheService } from '../../src/services/WeatherCacheService';
import { DailyWeather, WeatherCacheStore } from '../../src/types';

const LOCATION = 'New York, US';
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
    expect(cache.get(FORECAST_DATE, LOCATION)).toBeNull();
  });

  it('returns DailyWeather on forecast cache hit within 1 hour', async () => {
    const weather = makeWeather(FORECAST_DATE);
    await cache.set(FORECAST_DATE, LOCATION, weather);
    expect(cache.get(FORECAST_DATE, LOCATION)).toEqual(weather);
  });

  it('returns DailyWeather on historical cache hit within 24 hours', async () => {
    const weather = makeWeather(HISTORICAL_DATE);
    await cache.set(HISTORICAL_DATE, LOCATION, weather);
    expect(cache.get(HISTORICAL_DATE, LOCATION)).toEqual(weather);
  });

  it('returns null for expired forecast entry (older than 1 hour)', () => {
    const expiredStore: WeatherCacheStore = {
      [`${FORECAST_DATE}:${LOCATION}`]: {
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
    expect(c.get(FORECAST_DATE, LOCATION)).toBeNull();
  });

  it('returns null for expired historical entry (older than 24 hours)', () => {
    const expiredStore: WeatherCacheStore = {
      [`${HISTORICAL_DATE}:${LOCATION}`]: {
        data: makeWeather(HISTORICAL_DATE),
        fetchedAt: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
      },
    };
    // @ts-expect-error accessing private store for test setup
    const c = new WeatherCacheService(vi.fn().mockResolvedValue(expiredStore), vi.fn().mockResolvedValue(undefined));
    // @ts-expect-error
    c['store'] = expiredStore;
    expect(c.get(HISTORICAL_DATE, LOCATION)).toBeNull();
  });

  it('returns fresh historical entry that is within 24 hours', async () => {
    const weather = makeWeather(HISTORICAL_DATE);
    await cache.set(HISTORICAL_DATE, LOCATION, weather);
    expect(cache.get(HISTORICAL_DATE, LOCATION)).toEqual(weather);
  });

  it('returns null for different location than what was stored', async () => {
    await cache.set(FORECAST_DATE, LOCATION, makeWeather(FORECAST_DATE));
    expect(cache.get(FORECAST_DATE, 'London, GB')).toBeNull();
  });

  // --- set ---

  it('set persists via save', async () => {
    await cache.set(FORECAST_DATE, LOCATION, makeWeather(FORECAST_DATE));
    expect(save).toHaveBeenCalled();
  });

  it('set overwrites existing entry for same date+location', async () => {
    const weather1 = makeWeather(FORECAST_DATE);
    const weather2 = { ...makeWeather(FORECAST_DATE), condition: { code: 500, description: 'rain', iconCode: '10d' } };
    await cache.set(FORECAST_DATE, LOCATION, weather1);
    await cache.set(FORECAST_DATE, LOCATION, weather2);
    expect(cache.get(FORECAST_DATE, LOCATION)!.condition.code).toBe(500);
  });

  // --- init / purgeExpired ---

  it('init purges stale forecast entries (> 1 hour old)', async () => {
    const staleStore: WeatherCacheStore = {
      [`${FORECAST_DATE}:${LOCATION}`]: {
        data: makeWeather(FORECAST_DATE),
        fetchedAt: Date.now() - 2 * 60 * 60 * 1000,
      },
    };
    const c = new WeatherCacheService(vi.fn().mockResolvedValue(staleStore), vi.fn().mockResolvedValue(undefined));
    await c.init();
    expect(c.get(FORECAST_DATE, LOCATION)).toBeNull();
  });

  it('init keeps fresh forecast entries (< 1 hour old)', async () => {
    const freshStore: WeatherCacheStore = {
      [`${FORECAST_DATE}:${LOCATION}`]: {
        data: makeWeather(FORECAST_DATE),
        fetchedAt: Date.now() - 30 * 60 * 1000, // 30 minutes ago
      },
    };
    const c = new WeatherCacheService(vi.fn().mockResolvedValue(freshStore), vi.fn().mockResolvedValue(undefined));
    await c.init();
    expect(c.get(FORECAST_DATE, LOCATION)).not.toBeNull();
  });

  it('init keeps fresh historical entries (< 24 hours old)', async () => {
    const freshStore: WeatherCacheStore = {
      [`${HISTORICAL_DATE}:${LOCATION}`]: {
        data: makeWeather(HISTORICAL_DATE),
        fetchedAt: Date.now() - 12 * 60 * 60 * 1000, // 12 hours ago
      },
    };
    const c = new WeatherCacheService(vi.fn().mockResolvedValue(freshStore), vi.fn().mockResolvedValue(undefined));
    await c.init();
    expect(c.get(HISTORICAL_DATE, LOCATION)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx vitest run tests/services/WeatherCacheService.test.ts
```

Expected: FAIL — `WeatherCacheService` module not found.

- [ ] **Step 3: Implement `src/services/WeatherCacheService.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run tests/services/WeatherCacheService.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/WeatherCacheService.ts tests/services/WeatherCacheService.test.ts
git commit -m "feat: add WeatherCacheService with dual TTL (1h forecast, 24h historical)"
```

---

## Task 3: WeatherService (TDD)

**Files:**
- Create: `tests/services/WeatherService.test.ts`
- Create: `src/services/WeatherService.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/services/WeatherService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WeatherService } from '../../src/services/WeatherService';
import { WeatherCacheService } from '../../src/services/WeatherCacheService';
import { DailyWeather } from '../../src/types';

const LOCATION = 'New York, US';
const TODAY = '2026-04-15';
const TOMORROW = '2026-04-16';
const HISTORICAL = '2026-04-01';

const GEO_RESPONSE = [{ lat: 40.7128, lon: -74.006, name: 'New York', country: 'US' }];

const FORECAST_WEATHER: DailyWeather = {
  date: TODAY,
  condition: { code: 800, description: 'clear sky', iconCode: '01d' },
  tempCurrent: 72,
  tempHigh: 78,
  tempLow: 61,
  precipProbability: 0.1,
};

const HISTORICAL_WEATHER: DailyWeather = {
  date: HISTORICAL,
  condition: { code: 500, description: 'light rain', iconCode: '10d' },
  tempCurrent: 65,
  tempHigh: null,
  tempLow: null,
  precipProbability: null,
};

// Build Unix timestamp for a date at noon local time
function noonUnix(dateStr: string): number {
  return Math.floor(new Date(`${dateStr}T12:00:00`).getTime() / 1000);
}

// Build the forecast API response object where daily[0] corresponds to TODAY
function makeForecastResponse(dates: string[]): object {
  return {
    current: { dt: noonUnix(dates[0]), temp: 72, weather: [{ id: 800, description: 'clear sky', icon: '01d' }] },
    daily: dates.map((date, i) => ({
      dt: noonUnix(date),
      temp: { day: 72 - i, min: 61, max: 78 },
      pop: 0.1,
      weather: [{ id: 800, description: 'clear sky', icon: '01d' }],
    })),
  };
}

function makeTimemachineResponse(): object {
  return {
    data: [{
      dt: noonUnix(HISTORICAL),
      temp: 65,
      weather: [{ id: 500, description: 'light rain', icon: '10d' }],
    }],
  };
}

describe('WeatherService', () => {
  let cache: Pick<WeatherCacheService, 'get' | 'set'>;
  let service: WeatherService;

  beforeEach(() => {
    cache = {
      get: vi.fn().mockReturnValue(null),  // cache miss by default
      set: vi.fn().mockResolvedValue(undefined),
    };
    service = new WeatherService(
      () => 'test-api-key',
      () => LOCATION,
      () => 'imperial',
      cache as WeatherCacheService,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns all-null map when API key is empty', async () => {
    service = new WeatherService(() => '', () => LOCATION, () => 'imperial', cache as WeatherCacheService);
    const result = await service.getWeatherForDates([TODAY, TOMORROW]);
    expect(result.get(TODAY)).toBeNull();
    expect(result.get(TOMORROW)).toBeNull();
  });

  it('returns all-null map when location is empty', async () => {
    service = new WeatherService(() => 'key', () => '', () => 'imperial', cache as WeatherCacheService);
    const result = await service.getWeatherForDates([TODAY]);
    expect(result.get(TODAY)).toBeNull();
  });

  it('returns empty map when dates array is empty', async () => {
    const result = await service.getWeatherForDates([]);
    expect(result.size).toBe(0);
  });

  it('returns cached data without calling fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    (cache.get as ReturnType<typeof vi.fn>).mockReturnValue(FORECAST_WEATHER);
    const result = await service.getWeatherForDates([TODAY]);
    expect(result.get(TODAY)).toEqual(FORECAST_WEATHER);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('geocodes location then calls forecast API on cache miss for forecast dates', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(GEO_RESPONSE) })   // geo
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(makeForecastResponse([TODAY, TOMORROW])) }); // forecast
    vi.stubGlobal('fetch', fetchMock);

    const result = await service.getWeatherForDates([TODAY]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const geoUrl: string = fetchMock.mock.calls[0][0];
    expect(geoUrl).toContain('geo/1.0/direct');
    expect(geoUrl).toContain(encodeURIComponent(LOCATION));
    const forecastUrl: string = fetchMock.mock.calls[1][0];
    expect(forecastUrl).toContain('onecall');
    expect(forecastUrl).toContain('40.7128');
    expect(result.get(TODAY)).not.toBeNull();
  });

  it('caches forecast results via cache.set', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(GEO_RESPONSE) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(makeForecastResponse([TODAY])) }),
    );
    await service.getWeatherForDates([TODAY]);
    expect(cache.set).toHaveBeenCalledWith(TODAY, LOCATION, expect.objectContaining({ date: TODAY }));
  });

  it('reuses geocoded coordinates on second call (no second geo request)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(GEO_RESPONSE) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(makeForecastResponse([TODAY])) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(makeForecastResponse([TOMORROW])) });
    vi.stubGlobal('fetch', fetchMock);
    (cache.get as ReturnType<typeof vi.fn>).mockReturnValue(null);

    await service.getWeatherForDates([TODAY]);
    await service.getWeatherForDates([TOMORROW]);

    // Geo called only once; forecast called twice
    const geoCalls = fetchMock.mock.calls.filter((c: unknown[]) => (c[0] as string).includes('geo/1.0/direct'));
    expect(geoCalls).toHaveLength(1);
  });

  it('calls timemachine for historical dates', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(GEO_RESPONSE) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(makeTimemachineResponse()) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await service.getWeatherForDates([HISTORICAL]);

    const timemachineUrl: string = fetchMock.mock.calls[1][0];
    expect(timemachineUrl).toContain('onecall/timemachine');
    expect(result.get(HISTORICAL)).not.toBeNull();
    expect(result.get(HISTORICAL)!.tempHigh).toBeNull();
    expect(result.get(HISTORICAL)!.tempLow).toBeNull();
  });

  it('caches historical results via cache.set', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(GEO_RESPONSE) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(makeTimemachineResponse()) }),
    );
    await service.getWeatherForDates([HISTORICAL]);
    expect(cache.set).toHaveBeenCalledWith(HISTORICAL, LOCATION, expect.objectContaining({ date: HISTORICAL }));
  });

  it('returns null for a date when geo API returns empty array', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) }),  // no geo results
    );
    const result = await service.getWeatherForDates([TODAY]);
    expect(result.get(TODAY)).toBeNull();
  });

  it('returns null for a date when forecast API returns error', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(GEO_RESPONSE) })
      .mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' }),
    );
    const result = await service.getWeatherForDates([TODAY]);
    expect(result.get(TODAY)).toBeNull();
  });

  it('returns null for a date when timemachine API returns error', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(GEO_RESPONSE) })
      .mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' }),
    );
    const result = await service.getWeatherForDates([HISTORICAL]);
    expect(result.get(HISTORICAL)).toBeNull();
  });

  it('retries on 429 and succeeds after Retry-After delay', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(GEO_RESPONSE) })
      .mockResolvedValueOnce({ ok: false, status: 429, headers: { get: (h: string) => h === 'Retry-After' ? '1' : null } })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(makeForecastResponse([TODAY])) });
    vi.stubGlobal('fetch', fetchMock);

    const promise = service.getWeatherForDates([TODAY]);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.get(TODAY)).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3); // geo + 429 + success
  });

  it('returns null after 3 failed 429 attempts', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(GEO_RESPONSE) })
      .mockResolvedValue({ ok: false, status: 429, headers: { get: () => '1' } });
    vi.stubGlobal('fetch', fetchMock);

    const promise = service.getWeatherForDates([TODAY]);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.get(TODAY)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx vitest run tests/services/WeatherService.test.ts
```

Expected: FAIL — `WeatherService` module not found.

- [ ] **Step 3: Implement `src/services/WeatherService.ts`**

```typescript
import { DailyWeather } from '../types';
import { WeatherCacheService } from './WeatherCacheService';
import { Semaphore } from '../lib/semaphore';
import { toDateOnly } from '../lib/datetime';

const GEO_BASE = 'http://api.openweathermap.org/geo/1.0/direct';
const OWM_BASE = 'https://api.openweathermap.org/data/3.0/onecall';

interface Coords { lat: number; lon: number }

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

    if (!apiKey || !location || dates.length === 0) {
      for (const date of dates) result.set(date, null);
      return result;
    }

    // Serve from cache where possible
    const uncached: string[] = [];
    for (const date of dates) {
      const cached = this.cache.get(date, location);
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

    const forecastDates = uncached.filter((d) => new Date(d) >= today);
    const historicalDates = uncached.filter((d) => new Date(d) < today);

    // Fetch forecast (one call covers today + 7 days)
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

    // Fetch historical (one request per date, rate-limited by semaphore)
    await Promise.all(
      historicalDates.map(async (date) => {
        try {
          const weather = await this.fetchHistorical(apiKey, coords!, date, location);
          result.set(date, weather);
        } catch {
          result.set(date, null);
        }
      }),
    );

    return result;
  }

  private async getCoordinates(apiKey: string, location: string): Promise<Coords | null> {
    if (this.geocache?.location === location) {
      return { lat: this.geocache.lat, lon: this.geocache.lon };
    }
    const url = `${GEO_BASE}?q=${encodeURIComponent(location)}&limit=1&appid=${apiKey}`;
    const response = await this.fetchWithRetry(url, {});
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
      response = await this.fetchWithRetry(url, {});
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
      await this.cache.set(date, location, weather);
    }
    return result;
  }

  private async fetchHistorical(apiKey: string, coords: Coords, dateStr: string, location: string): Promise<DailyWeather | null> {
    const units = this.getUnits();
    // Use noon local time for a representative midday reading
    const dt = Math.floor(new Date(`${dateStr}T12:00:00`).getTime() / 1000);
    const url = `${OWM_BASE}/timemachine?lat=${coords.lat}&lon=${coords.lon}&dt=${dt}&appid=${apiKey}&units=${units}`;

    await this.semaphore.acquire();
    let response: Response;
    try {
      response = await this.fetchWithRetry(url, {});
    } finally {
      this.semaphore.release();
    }
    if (!response.ok) return null;

    const data = await response.json() as {
      data: Array<{ temp: number; weather: Array<{ id: number; description: string; icon: string }> }>;
    };
    if (!data.data?.length) return null;

    const point = data.data[0];
    const weather: DailyWeather = {
      date: dateStr,
      condition: { code: point.weather[0].id, description: point.weather[0].description, iconCode: point.weather[0].icon },
      tempCurrent: point.temp,
      tempHigh: null,
      tempLow: null,
      precipProbability: null,
    };
    await this.cache.set(dateStr, location, weather);
    return weather;
  }

  private async fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const response = await fetch(url, options);
      if (response.status !== 429) return response;
      if (attempt < MAX_RETRIES - 1) {
        const raw = parseInt(response.headers.get('Retry-After') ?? '', 10);
        const retryAfter = Number.isFinite(raw) && raw > 0 ? raw : 10;
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      }
    }
    throw new Error('Weather API: Too Many Requests');
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run tests/services/WeatherService.test.ts
```

Expected: all pass.

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
npm test
```

Expected: all existing tests continue to pass.

- [ ] **Step 6: Commit**

```bash
git add src/services/WeatherService.ts tests/services/WeatherService.test.ts
git commit -m "feat: add WeatherService with geocoding, forecast/historical fetch, 429 retry"
```

---

## Task 4: Wire AppContext, main.ts, and settings UI

**Files:**
- Modify: `src/context.ts`
- Modify: `src/main.ts`
- Modify: `src/settings.ts`
- Modify: `tests/components/CalendarApp.test.tsx` (update `makeContext` to satisfy new type)

- [ ] **Step 1: Add `weatherService` to `AppContextValue` in `src/context.ts`**

Replace the contents of `src/context.ts` with:

```typescript
import { createContext, useContext } from 'react';
import { App } from 'obsidian';
import { CalendarService } from './services/CalendarService';
import { WeatherService } from './services/WeatherService';
import { M365CalendarSettings } from './types';

export interface AppContextValue {
  app: App;
  calendarService: CalendarService;
  weatherService: WeatherService;
  settings: M365CalendarSettings;
  saveSettings: (s: M365CalendarSettings) => Promise<void>;
}

export const AppContext = createContext<AppContextValue | undefined>(undefined);

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppContext.Provider');
  return ctx;
}
```

- [ ] **Step 2: Construct and wire services in `src/main.ts`**

Add `WeatherCacheService` and `WeatherService` imports at the top of `src/main.ts`:

```typescript
import { WeatherService } from './services/WeatherService';
import { WeatherCacheService } from './services/WeatherCacheService';
import { WeatherCacheStore } from './types';
```

Add private fields after `private cacheService!: CacheService;`:

```typescript
private weatherCacheService!: WeatherCacheService;
private weatherService!: WeatherService;
```

Add construction after `await this.cacheService.init();` in `onload()`:

```typescript
this.weatherCacheService = new WeatherCacheService(
  async () => {
    const data = await this.loadData();
    return (data?.weatherCache as WeatherCacheStore) ?? {};
  },
  async (weatherCache) => {
    const data = (await this.loadData()) ?? {};
    await this.saveData({ ...data, weatherCache });
  },
);
await this.weatherCacheService.init();

this.weatherService = new WeatherService(
  () => this.settings.openWeatherApiKey,
  () => this.settings.weatherLocation,
  () => this.settings.weatherUnits,
  this.weatherCacheService,
);
```

In the `registerView` callback, add `weatherService: this.weatherService` to the context object passed to `M365CalendarView`:

```typescript
this.registerView(VIEW_TYPE_M365_CALENDAR, (leaf) => {
  return new M365CalendarView(leaf, {
    app: this.app,
    calendarService: this.calendarService,
    weatherService: this.weatherService,
    settings: this.settings,
    saveSettings: async (s) => {
      this.settings = s;
      await this.saveSettings();
    },
  });
});
```

- [ ] **Step 3: Add Weather settings section to `src/settings.ts`**

Add the following block to the end of the `display()` method in `M365CalendarSettingTab`, just before the closing `}`:

```typescript
new Setting(containerEl).setName('Weather').setHeading();

new Setting(containerEl)
  .setName('Show weather')
  .setDesc('Display weather conditions in calendar views. Requires an OpenWeather API key.')
  .addToggle((toggle) =>
    toggle
      .setValue(this.plugin.settings.weatherEnabled)
      .onChange(async (value) => {
        this.plugin.settings.weatherEnabled = value;
        await this.plugin.saveSettings();
      }),
  );

new Setting(containerEl)
  .setName('OpenWeather API key') // eslint-disable-line obsidianmd/ui/sentence-case
  .setDesc('One Call API 3.0 key from openweathermap.org.') // eslint-disable-line obsidianmd/ui/sentence-case
  .addText((text) =>
    text
      .setPlaceholder('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') // eslint-disable-line obsidianmd/ui/sentence-case
      .setValue(this.plugin.settings.openWeatherApiKey)
      .onChange(async (value) => {
        this.plugin.settings.openWeatherApiKey = value.trim();
        await this.plugin.saveSettings();
      }),
  );

new Setting(containerEl)
  .setName('Location')
  .setDesc('City and country code, e.g. "New York, US" or "London, GB".')
  .addText((text) =>
    text
      .setPlaceholder('New York, US') // eslint-disable-line obsidianmd/ui/sentence-case
      .setValue(this.plugin.settings.weatherLocation)
      .onChange(async (value) => {
        this.plugin.settings.weatherLocation = value.trim();
        await this.plugin.saveSettings();
      }),
  );

new Setting(containerEl)
  .setName('Temperature units')
  .addDropdown((dropdown) =>
    dropdown
      .addOption('imperial', 'Fahrenheit (°F)')
      .addOption('metric', 'Celsius (°C)')
      .setValue(this.plugin.settings.weatherUnits)
      .onChange(async (value) => {
        this.plugin.settings.weatherUnits = value as 'imperial' | 'metric';
        await this.plugin.saveSettings();
      }),
  );
```

- [ ] **Step 4: Update `makeContext` in `tests/components/CalendarApp.test.tsx`**

Add a `weatherService` mock to the `makeContext` function. The existing function returns an object literal — add `weatherService` alongside `calendarService`:

```typescript
function makeContext(overrides: Partial<AppContextValue> = {}): AppContextValue {
  return {
    app: {} as AppContextValue['app'],
    calendarService: {
      getCalendars: vi.fn().mockResolvedValue([mockCalendar]),
      getEvents: vi.fn().mockResolvedValue([mockEvent]),
      createEvent: vi.fn(),
      updateEvent: vi.fn(),
      deleteEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppContextValue['calendarService'],
    weatherService: {
      getWeatherForDates: vi.fn().mockResolvedValue(new Map()),
    } as unknown as AppContextValue['weatherService'],
    settings: { ...DEFAULT_SETTINGS, enabledCalendarIds: ['cal-1'] },
    saveSettings: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/context.ts src/main.ts src/settings.ts tests/components/CalendarApp.test.tsx
git commit -m "feat: wire WeatherService into AppContext, main.ts, and settings UI"
```

---

## Task 5: CalendarApp weather state and `fetchWeather`

**Files:**
- Modify: `src/components/CalendarApp.tsx`
- Modify: `tests/components/CalendarApp.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add these tests to the end of the `describe('CalendarApp', ...)` block in `tests/components/CalendarApp.test.tsx`:

```typescript
it('calls weatherService.getWeatherForDates when weatherEnabled is true', async () => {
  const ctx = makeContext({
    settings: { ...DEFAULT_SETTINGS, enabledCalendarIds: ['cal-1'], weatherEnabled: true, weatherLocation: 'New York, US', openWeatherApiKey: 'key' },
  });
  renderCalendarApp(ctx);

  await waitFor(() => {
    expect(ctx.weatherService.getWeatherForDates).toHaveBeenCalled();
  });
});

it('does not call weatherService.getWeatherForDates when weatherEnabled is false', async () => {
  const ctx = makeContext({
    settings: { ...DEFAULT_SETTINGS, enabledCalendarIds: ['cal-1'], weatherEnabled: false },
  });
  renderCalendarApp(ctx);

  // Wait for calendar fetch to complete so we know the component mounted
  await waitFor(() => expect(ctx.calendarService.getEvents).toHaveBeenCalled());

  expect(ctx.weatherService.getWeatherForDates).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx vitest run tests/components/CalendarApp.test.tsx -t "weatherService"
```

Expected: FAIL — `getWeatherForDates` not called.

- [ ] **Step 3: Add weather state and `fetchWeather` to `src/components/CalendarApp.tsx`**

Add `DailyWeather` to the import from `../types`:
```typescript
import { M365Calendar, M365Event, DailyWeather } from '../types';
```

Add `toDateOnly` to the import from `../lib/datetime`:
```typescript
import { toDateOnly } from '../lib/datetime';
```

Add `weatherService` to the context destructure:
```typescript
const { app, calendarService, weatherService, settings, saveSettings } = useAppContext();
```

Add weather state after the existing `useState` declarations:
```typescript
const [weather, setWeather] = useState<Map<string, DailyWeather | null>>(new Map());
```

Add a `getDatesInRange` helper above `CalendarApp` (module-level, after `getDateRange`):
```typescript
function getDatesInRange(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const current = new Date(start);
  while (current < end) {
    dates.push(toDateOnly(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}
```

Add a `fetchWeather` callback after the `fetchAll` callback:
```typescript
const fetchWeather = useCallback(async () => {
  if (!settings.weatherEnabled) {
    setWeather(new Map());
    return;
  }
  const { start, end } = getDateRange(currentDate, view);
  const dates = getDatesInRange(start, end);
  try {
    const result = await weatherService.getWeatherForDates(dates);
    setWeather(result);
  } catch {
    setWeather(new Map(dates.map((d) => [d, null])));
  }
}, [weatherService, settings.weatherEnabled, currentDate, view]);
```

Add a `useEffect` for `fetchWeather` after the existing `useEffect` for `fetchAll`:
```typescript
useEffect(() => {
  void fetchWeather();
}, [fetchWeather]);
```

Add `weather` to the interval refresh (replace the existing interval effect):
```typescript
useEffect(() => {
  const ms = settings.refreshIntervalMinutes * 60 * 1000;
  const interval = setInterval(() => {
    void fetchAll({ reloadCalendars: true });
    void fetchWeather();
  }, ms);
  return () => clearInterval(interval);
}, [fetchAll, fetchWeather, settings.refreshIntervalMinutes]);
```

- [ ] **Step 4: Run weather tests**

```bash
npx vitest run tests/components/CalendarApp.test.tsx -t "weatherService"
```

Expected: both new tests pass.

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: no errors. (The `weather` prop is not yet passed to views — that happens in Tasks 6–8 alongside each view update so typecheck stays clean at every step.)

- [ ] **Step 7: Commit**

```bash
git add src/components/CalendarApp.tsx tests/components/CalendarApp.test.tsx
git commit -m "feat: add weather state and fetchWeather to CalendarApp"
```

---

## Task 6: MonthView weather icon

**Files:**
- Modify: `src/components/CalendarApp.tsx`
- Modify: `src/components/MonthView.tsx`
- Modify: `tests/components/MonthView.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add these tests to the end of `tests/components/MonthView.test.tsx`. First add imports at the top:

```typescript
import { DailyWeather } from '../../src/types';
```

Then add inside `describe('MonthView', ...)`:

```typescript
const forecastWeather: DailyWeather = {
  date: '2026-04-04',
  condition: { code: 800, description: 'clear sky', iconCode: '01d' },
  tempCurrent: 72,
  tempHigh: 78,
  tempLow: 61,
  precipProbability: 0.1,
};

it('renders weather icon img when DailyWeather is present for a date', () => {
  const weatherMap = new Map<string, DailyWeather | null>([['2026-04-04', forecastWeather]]);
  render(
    <MonthView
      currentDate={new Date('2026-04-01')}
      events={[]}
      calendars={[]}
      onDayClick={vi.fn()}
      weather={weatherMap}
    />,
  );
  const img = document.querySelector('.m365-weather-icon') as HTMLImageElement;
  expect(img).not.toBeNull();
  expect(img.src).toContain('01d');
  expect(img.alt).toBe('clear sky');
});

it('renders ? placeholder when weather is null for a date', () => {
  const weatherMap = new Map<string, DailyWeather | null>([['2026-04-04', null]]);
  render(
    <MonthView
      currentDate={new Date('2026-04-01')}
      events={[]}
      calendars={[]}
      onDayClick={vi.fn()}
      weather={weatherMap}
    />,
  );
  expect(document.querySelector('.m365-weather-unknown')).not.toBeNull();
});

it('renders no weather element when weather prop is absent', () => {
  render(
    <MonthView
      currentDate={new Date('2026-04-01')}
      events={[]}
      calendars={[]}
      onDayClick={vi.fn()}
    />,
  );
  expect(document.querySelector('.m365-weather-icon')).toBeNull();
  expect(document.querySelector('.m365-weather-unknown')).toBeNull();
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx vitest run tests/components/MonthView.test.tsx -t "weather"
```

Expected: FAIL — props not accepted / elements not rendered.

- [ ] **Step 3: Pass `weather` prop to `MonthView` in `src/components/CalendarApp.tsx`**

In the `{view === 'month' && ...}` block, add `weather={weather}` to `<MonthView>`:

```tsx
{view === 'month' && (
  <MonthView
    currentDate={currentDate}
    events={events}
    calendars={calendars}
    onDayClick={handleDayClick}
    onEventClick={handleEventClick}
    weather={weather}
  />
)}
```

- [ ] **Step 4: Update `MonthView` to accept and render weather**

In `src/components/MonthView.tsx`, add `DailyWeather` to the import:
```typescript
import { M365Event, M365Calendar, DailyWeather } from '../types';
```

Add `weather` to the props interface:
```typescript
interface MonthViewProps {
  currentDate: Date;
  events: M365Event[];
  calendars: M365Calendar[];
  onDayClick: (date: Date) => void;
  onEventClick?: (event: M365Event) => void;
  maxEventsPerDay?: number;
  weather?: Map<string, DailyWeather | null>;
}
```

Add `weather` to the destructured props:
```typescript
export const MonthView: React.FC<MonthViewProps> = ({
  currentDate,
  events,
  calendars,
  onDayClick,
  onEventClick,
  maxEventsPerDay = 6,
  weather,
}) => {
```

Inside the day cell JSX, add a weather indicator after `<span className="m365-calendar-day-number">`. The cell already has `position: relative` via CSS. Add this after the day number span:

```tsx
{weather !== undefined && (() => {
  const w = weather.get(cellDateStr);
  if (w === undefined) return null;
  if (w === null) return <span className="m365-weather-unknown m365-weather-month">?</span>;
  return (
    <img
      className="m365-weather-icon m365-weather-month"
      src={`https://openweathermap.org/img/wn/${w.condition.iconCode}.png`}
      alt={w.condition.description}
      width={24}
      height={24}
    />
  );
})()}
```

- [ ] **Step 5: Run weather tests**

```bash
npx vitest run tests/components/MonthView.test.tsx -t "weather"
```

Expected: all 3 new tests pass.

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 7: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/CalendarApp.tsx src/components/MonthView.tsx tests/components/MonthView.test.tsx
git commit -m "feat: add weather icon to MonthView day cells"
```

---

## Task 7: WeekView weather strip

**Files:**
- Modify: `src/components/CalendarApp.tsx`
- Modify: `src/components/WeekView.tsx`
- Modify: `tests/components/WeekView.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add at the top of `tests/components/WeekView.test.tsx`:

```typescript
import { DailyWeather } from '../../src/types';
```

Add these tests inside `describe('WeekView', ...)`:

```typescript
const weekWeather: DailyWeather = {
  date: '2026-04-06',
  condition: { code: 800, description: 'clear sky', iconCode: '01d' },
  tempCurrent: 72,
  tempHigh: 78,
  tempLow: 61,
  precipProbability: 0.2,
};

it('renders weather strip with icon when DailyWeather is present', () => {
  const weatherMap = new Map<string, DailyWeather | null>([['2026-04-06', weekWeather]]);
  render(
    <WeekView
      currentDate={new Date('2026-04-06')}
      events={[]}
      calendars={[]}
      onDayClick={vi.fn()}
      weather={weatherMap}
    />,
  );
  const img = document.querySelector('.m365-weather-icon') as HTMLImageElement;
  expect(img).not.toBeNull();
  expect(img.src).toContain('01d');
  // Temperature values should appear
  expect(screen.getByText(/78/)).toBeInTheDocument();
  expect(screen.getByText(/61/)).toBeInTheDocument();
  expect(screen.getByText(/20%/)).toBeInTheDocument();
});

it('renders ? placeholder in header when weather is null for a day', () => {
  const weatherMap = new Map<string, DailyWeather | null>([['2026-04-06', null]]);
  render(
    <WeekView
      currentDate={new Date('2026-04-06')}
      events={[]}
      calendars={[]}
      onDayClick={vi.fn()}
      weather={weatherMap}
    />,
  );
  expect(document.querySelector('.m365-weather-unknown')).not.toBeNull();
});

it('renders no weather strip when weather prop is absent', () => {
  render(
    <WeekView
      currentDate={new Date('2026-04-06')}
      events={[]}
      calendars={[]}
      onDayClick={vi.fn()}
    />,
  );
  expect(document.querySelector('.m365-weather-icon')).toBeNull();
  expect(document.querySelector('.m365-weather-unknown')).toBeNull();
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx vitest run tests/components/WeekView.test.tsx -t "weather"
```

Expected: FAIL.

- [ ] **Step 3: Pass `weather` prop to `WeekView` in `src/components/CalendarApp.tsx`**

In the `{view === 'week' && ...}` block, add `weather={weather}` to `<WeekView>`:

```tsx
{view === 'week' && (
  <WeekView
    currentDate={currentDate}
    events={events}
    calendars={calendars}
    onDayClick={handleDayClick}
    onEventClick={handleEventClick}
    weather={weather}
  />
)}
```

- [ ] **Step 4: Update `WeekView` to accept and render weather** 

In `src/components/WeekView.tsx`, add `DailyWeather` to the import:
```typescript
import { M365Event, M365Calendar, DailyWeather } from '../types';
```

Add `weather` to props interface:
```typescript
interface WeekViewProps {
  currentDate: Date;
  events: M365Event[];
  calendars: M365Calendar[];
  onDayClick: (date: Date) => void;
  onEventClick?: (event: M365Event) => void;
  weather?: Map<string, DailyWeather | null>;
}
```

Add `weather` to destructured props:
```typescript
export const WeekView: React.FC<WeekViewProps> = ({
  currentDate,
  events,
  calendars,
  onDayClick,
  onEventClick,
  weather,
}) => {
```

Add a helper function to format temperature (above the component or inline):
```typescript
function formatTemp(temp: number | null, units: string): string {
  if (temp === null) return '—';
  return `${Math.round(temp)}°${units === 'imperial' ? 'F' : 'C'}`;
}
```

Inside the day header `<div className="m365-calendar-week-day-header">`, after the existing day name/number spans, add the weather strip:

```tsx
{weather !== undefined && (() => {
  const dateStr = toDateOnly(day);
  const w = weather.get(dateStr);
  if (w === undefined) return null;
  if (w === null) return (
    <div className="m365-weather-strip m365-weather-week">
      <span className="m365-weather-unknown">?</span>
    </div>
  );
  return (
    <div className="m365-weather-strip m365-weather-week">
      <img
        className="m365-weather-icon"
        src={`https://openweathermap.org/img/wn/${w.condition.iconCode}.png`}
        alt={w.condition.description}
        width={24}
        height={24}
      />
      <div className="m365-weather-temps">
        <span className="m365-weather-current">{w.tempCurrent !== null ? `${Math.round(w.tempCurrent)}°` : '—'}</span>
        <span className="m365-weather-high">H: {w.tempHigh !== null ? `${Math.round(w.tempHigh)}°` : '—'}</span>
        <span className="m365-weather-low">L: {w.tempLow !== null ? `${Math.round(w.tempLow)}°` : '—'}</span>
        <span className="m365-weather-precip">☂ {w.precipProbability !== null ? `${Math.round(w.precipProbability * 100)}%` : '—'}</span>
      </div>
    </div>
  );
})()}
```

- [ ] **Step 5: Run weather tests**

```bash
npx vitest run tests/components/WeekView.test.tsx -t "weather"
```

Expected: all 3 new tests pass.

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 7: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/CalendarApp.tsx src/components/WeekView.tsx tests/components/WeekView.test.tsx
git commit -m "feat: add weather strip to WeekView day column headers"
```

---

## Task 8: DayView weather banner

**Files:**
- Modify: `src/components/CalendarApp.tsx`
- Modify: `src/components/DayView.tsx`
- Modify: `tests/components/DayView.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add at the top of `tests/components/DayView.test.tsx`:

```typescript
import { DailyWeather } from '../../src/types';
```

Add these tests inside `describe('DayView', ...)` (outside the nested `describe('layoutEvents', ...)` block):

```typescript
describe('weather banner', () => {
  const currentDate = new Date('2026-04-14');

  const forecastWeather: DailyWeather = {
    date: '2026-04-14',
    condition: { code: 800, description: 'clear sky', iconCode: '01d' },
    tempCurrent: 72,
    tempHigh: 78,
    tempLow: 61,
    precipProbability: 0.2,
  };

  const historicalWeather: DailyWeather = {
    date: '2026-04-14',
    condition: { code: 500, description: 'light rain', iconCode: '10d' },
    tempCurrent: 65,
    tempHigh: null,
    tempLow: null,
    precipProbability: null,
  };

  it('renders weather banner with icon, temps, and precip for forecast data', () => {
    const weatherMap = new Map<string, DailyWeather | null>([['2026-04-14', forecastWeather]]);
    render(
      <DayView
        currentDate={currentDate}
        events={[]}
        calendars={[]}
        onTimeClick={vi.fn()}
        weather={weatherMap}
      />,
    );
    const img = document.querySelector('.m365-weather-icon') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.src).toContain('01d');
    expect(screen.getByText(/72°/)).toBeInTheDocument();
    expect(screen.getByText(/78°/)).toBeInTheDocument();
    expect(screen.getByText(/61°/)).toBeInTheDocument();
    expect(screen.getByText(/20%/)).toBeInTheDocument();
  });

  it('renders dashes for null tempHigh/tempLow/precip on historical data', () => {
    const weatherMap = new Map<string, DailyWeather | null>([['2026-04-14', historicalWeather]]);
    render(
      <DayView
        currentDate={currentDate}
        events={[]}
        calendars={[]}
        onTimeClick={vi.fn()}
        weather={weatherMap}
      />,
    );
    expect(screen.getByText(/65°/)).toBeInTheDocument();
    // null fields rendered as —
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('renders ? and unavailable label when weather is null', () => {
    const weatherMap = new Map<string, DailyWeather | null>([['2026-04-14', null]]);
    render(
      <DayView
        currentDate={currentDate}
        events={[]}
        calendars={[]}
        onTimeClick={vi.fn()}
        weather={weatherMap}
      />,
    );
    expect(document.querySelector('.m365-weather-unknown')).not.toBeNull();
    expect(screen.getByText('Weather data unavailable')).toBeInTheDocument();
  });

  it('renders no weather banner when weather prop is absent', () => {
    render(
      <DayView
        currentDate={currentDate}
        events={[]}
        calendars={[]}
        onTimeClick={vi.fn()}
      />,
    );
    expect(document.querySelector('.m365-weather-banner')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx vitest run tests/components/DayView.test.tsx -t "weather"
```

Expected: FAIL.

- [ ] **Step 3: Pass `weather` prop to `DayView` in `src/components/CalendarApp.tsx`**

In the `{view === 'day' && ...}` block, add `weather={weather}` to `<DayView>`:

```tsx
{view === 'day' && (
  <DayView
    currentDate={currentDate}
    events={events}
    calendars={calendars}
    onTimeClick={openCreateEventModal}
    onEventClick={handleEventClick}
    weather={weather}
  />
)}
```

- [ ] **Step 4: Update `DayView` to accept and render weather**

In `src/components/DayView.tsx`, add `DailyWeather` to the import from `../types`:
```typescript
import { M365Event, M365Calendar, DailyWeather } from '../types';
```

Add `toDateOnly` to the import from `../lib/datetime`:
```typescript
import { toDateOnly } from '../lib/datetime';
```

Add `weather` to the props interface:
```typescript
interface DayViewProps {
  currentDate: Date;
  events: M365Event[];
  calendars: M365Calendar[];
  onTimeClick: (date: Date) => void;
  onEventClick?: (event: M365Event) => void;
  weather?: Map<string, DailyWeather | null>;
}
```

Add `weather` to destructured props:
```typescript
export const DayView: React.FC<DayViewProps> = ({
  currentDate,
  events,
  calendars,
  onTimeClick,
  onEventClick,
  weather,
}) => {
```

Add this computed value inside the component body, after the existing `useMemo` declarations:
```typescript
const dailyWeather = weather !== undefined ? weather.get(toDateOnly(currentDate)) : undefined;
```

Insert the weather banner between the all-day events section and the `<div ref={timelineRef}>`. The returned JSX should become:

```tsx
return (
  <div className="m365-day-view" ref={scrollRef}>
    {allDayEvents.length > 0 && (
      <div className="m365-day-view-allday">
        {allDayEvents.map((event) => {
          const cal = calendarMap.get(event.calendarId);
          if (!cal) return null;
          return (
            <button
              key={event.id}
              type="button"
              className="m365-event-click-btn"
              aria-label={`Edit event: ${event.subject}`}
              onMouseEnter={(e) => showPopover(event, cal, e.currentTarget.getBoundingClientRect())}
              onMouseLeave={() => hidePopover()}
              onClick={(e) => {
                e.stopPropagation();
                onEventClick?.(event);
              }}
            >
              <EventCard event={event} calendar={cal} />
            </button>
          );
        })}
      </div>
    )}
    {dailyWeather !== undefined && (
      <div className="m365-weather-banner">
        {dailyWeather === null ? (
          <>
            <span className="m365-weather-unknown">?</span>
            <span className="m365-weather-unavailable">Weather data unavailable</span>
          </>
        ) : (
          <>
            <img
              className="m365-weather-icon"
              src={`https://openweathermap.org/img/wn/${dailyWeather.condition.iconCode}.png`}
              alt={dailyWeather.condition.description}
              width={32}
              height={32}
            />
            <span className="m365-weather-current">
              {dailyWeather.tempCurrent !== null ? `${Math.round(dailyWeather.tempCurrent)}°` : '—'}
            </span>
            <span className="m365-weather-high">
              H: {dailyWeather.tempHigh !== null ? `${Math.round(dailyWeather.tempHigh)}°` : '—'}
            </span>
            <span className="m365-weather-low">
              L: {dailyWeather.tempLow !== null ? `${Math.round(dailyWeather.tempLow)}°` : '—'}
            </span>
            <span className="m365-weather-precip">
              ☂ {dailyWeather.precipProbability !== null ? `${Math.round(dailyWeather.precipProbability * 100)}%` : '—'}
            </span>
          </>
        )}
      </div>
    )}
    <div ref={timelineRef}>
      <TimelineColumn
        date={currentDate}
        events={timedEvents}
        calendars={calendars}
        onTimeClick={onTimeClick}
        onEventClick={onEventClick}
        showLabels={true}
        showNowLine={isToday}
        data-testid="m365-day-timeline"
      />
    </div>
  </div>
);
```

- [ ] **Step 5: Run weather tests**

```bash
npx vitest run tests/components/DayView.test.tsx -t "weather"
```

Expected: all 4 new tests pass.

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 7: Typecheck and lint**

```bash
npm run typecheck && npm run lint
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/CalendarApp.tsx src/components/DayView.tsx tests/components/DayView.test.tsx
git commit -m "feat: add weather banner to DayView above timeline"
```
