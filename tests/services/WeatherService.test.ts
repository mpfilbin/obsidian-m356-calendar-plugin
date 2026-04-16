import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WeatherService } from '../../src/services/WeatherService';
import { WeatherCacheService } from '../../src/services/WeatherCacheService';
import { DailyWeather } from '../../src/types';
import { toDateOnly } from '../../src/lib/datetime';

const LOCATION = 'New York, US';
// Computed dynamically so tests remain correct regardless of when they run
const TODAY      = toDateOnly(new Date());
const TOMORROW   = toDateOnly(new Date(Date.now() + 86_400_000));
const HISTORICAL = toDateOnly(new Date(Date.now() - 14 * 86_400_000));

const GEO_RESPONSE = [{ lat: 40.7128, lon: -74.006, name: 'New York', country: 'US' }];

const FORECAST_WEATHER: DailyWeather = {
  date: TODAY,
  condition: { code: 800, description: 'clear sky', iconCode: '01d' },
  tempCurrent: 72,
  tempHigh: 78,
  tempLow: 61,
  precipProbability: 0.1,
};

// Build Unix timestamp for a date at noon UTC — matches real OpenWeather One Call 3.0 behavior
// where daily[].dt is approximately noon in the location's local timezone (not midnight UTC).
// Tests run in jsdom (UTC), so noon UTC = noon local → toDateOnly correctly returns dateStr.
function noonUtcUnix(dateStr: string): number {
  return Math.floor(new Date(`${dateStr}T12:00:00Z`).getTime() / 1000);
}

// Build the forecast API response object where daily[0] corresponds to TODAY
function makeForecastResponse(dates: string[]): object {
  return {
    current: { dt: noonUtcUnix(dates[0]), temp: 72, weather: [{ id: 800, description: 'clear sky', icon: '01d' }] },
    daily: dates.map((date, i) => ({
      dt: noonUtcUnix(date),
      temp: { day: 72 - i, min: 61, max: 78 },
      pop: 0.1,
      weather: [{ id: 800, description: 'clear sky', icon: '01d' }],
    })),
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
    expect(cache.set).toHaveBeenCalledWith(TODAY, LOCATION, expect.objectContaining({ date: TODAY }), 'imperial');
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

  it('omits historical dates from result without making any API call', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(GEO_RESPONSE) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await service.getWeatherForDates([HISTORICAL]);

    // No timemachine call — historical dates are simply not included in the result map
    const urls: string[] = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(urls.every((u) => !u.includes('timemachine'))).toBe(true);
    expect(result.has(HISTORICAL)).toBe(false);
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
