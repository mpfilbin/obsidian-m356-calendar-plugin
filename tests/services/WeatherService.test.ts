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
