import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requestUrl, type RequestUrlResponse } from 'obsidian';
import { GeocodingService, GeocodingError } from '../../src/services/GeocodingService';

const response = (status: number, json: unknown = []): RequestUrlResponse =>
  ({ status, json, headers: {}, arrayBuffer: new ArrayBuffer(0), text: '' }) as RequestUrlResponse;

const SEATTLE = [{ lat: '47.6097', lon: '-122.3425', display_name: 'Pike Place Market, Seattle, WA, USA' }];

describe('GeocodingService', () => {
  let service: GeocodingService;

  beforeEach(() => {
    vi.mocked(requestUrl).mockReset();
    service = new GeocodingService('test-agent/1.0');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks Nominatim for the best match, identifying itself, and returns the coordinates', async () => {
    vi.mocked(requestUrl).mockResolvedValue(response(200, SEATTLE));
    const result = await service.geocode('Pike Place Market, Seattle');

    expect(result).toEqual({ lat: 47.6097, lon: -122.3425, displayName: 'Pike Place Market, Seattle, WA, USA' });
    const call = vi.mocked(requestUrl).mock.calls[0][0] as { url: string; headers: Record<string, string> };
    const url = new URL(call.url);
    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/search');
    expect(url.searchParams.get('q')).toBe('Pike Place Market, Seattle');
    expect(url.searchParams.get('limit')).toBe('1');
    expect(url.searchParams.get('format')).toBe('jsonv2');
    expect(call.headers['User-Agent']).toBe('test-agent/1.0');
  });

  it('returns null when nothing matches', async () => {
    vi.mocked(requestUrl).mockResolvedValue(response(200, []));
    expect(await service.geocode('asdfghjkl')).toBeNull();
  });

  it('returns null for an unusable result', async () => {
    vi.mocked(requestUrl).mockResolvedValue(response(200, [{ lat: 'nope', lon: 'nope' }]));
    expect(await service.geocode('Somewhere')).toBeNull();
  });

  it('does not call the service for blank text', async () => {
    expect(await service.geocode('   ')).toBeNull();
    expect(requestUrl).not.toHaveBeenCalled();
  });

  it('remembers results, ignoring case and extra spaces, so repeats cost nothing', async () => {
    vi.mocked(requestUrl).mockResolvedValue(response(200, SEATTLE));
    await service.geocode('Pike Place Market');
    await service.geocode('  pike   PLACE market ');
    expect(requestUrl).toHaveBeenCalledTimes(1);
  });

  it('remembers "no match" too', async () => {
    vi.mocked(requestUrl).mockResolvedValue(response(200, []));
    await service.geocode('asdfghjkl');
    await service.geocode('asdfghjkl');
    expect(requestUrl).toHaveBeenCalledTimes(1);
  });

  it('shares one request between identical lookups made at the same time', async () => {
    vi.mocked(requestUrl).mockResolvedValue(response(200, SEATTLE));
    const [a, b] = await Promise.all([service.geocode('Pike Place'), service.geocode('Pike Place')]);
    expect(a).toEqual(b);
    expect(requestUrl).toHaveBeenCalledTimes(1);
  });

  it('spaces different lookups at least a second apart to respect the usage policy', async () => {
    vi.useFakeTimers();
    vi.mocked(requestUrl).mockResolvedValue(response(200, SEATTLE));
    const first = service.geocode('One');
    const second = service.geocode('Two');
    const third = service.geocode('Three');

    await vi.advanceTimersByTimeAsync(0);
    expect(requestUrl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(requestUrl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(requestUrl).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1100);
    expect(requestUrl).toHaveBeenCalledTimes(3);
    await Promise.all([first, second, third]);
  });

  it('reports a busy service (429)', async () => {
    vi.mocked(requestUrl).mockResolvedValue(response(429));
    const failure = service.geocode('Pike Place');
    await expect(failure).rejects.toThrow(GeocodingError);
    await expect(failure).rejects.toThrow(/busy/);
  });

  it('retries a failed lookup next time instead of caching the error', async () => {
    vi.useFakeTimers();
    vi.mocked(requestUrl).mockResolvedValueOnce(response(503)).mockResolvedValueOnce(response(200, SEATTLE));
    const failed = expect(service.geocode('Pike Place')).rejects.toThrow(/HTTP 503/);
    await vi.runAllTimersAsync();
    await failed;
    const retry = service.geocode('Pike Place');
    await vi.runAllTimersAsync();
    expect((await retry)?.lat).toBe(47.6097);
  });

  it('turns a network failure into a friendly error', async () => {
    vi.mocked(requestUrl).mockRejectedValue(new Error('net::ERR_INTERNET_DISCONNECTED'));
    await expect(service.geocode('Pike Place')).rejects.toThrow(/Could not reach the map service/);
  });

  it('logs lookups without the place text', async () => {
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    vi.mocked(requestUrl).mockResolvedValue(response(200, SEATTLE));
    await new GeocodingService('ua', logger).geocode('My secret clinic');
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain('secret clinic');
  });
});
