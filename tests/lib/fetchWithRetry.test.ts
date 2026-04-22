import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWithRetry } from '../../src/lib/fetchWithRetry';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('fetchWithRetry', () => {
  it('returns the response immediately when status is not 429', async () => {
    const mockResponse = { ok: true, status: 200 } as Response;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));
    const result = await fetchWithRetry('https://example.com', {});
    expect(result).toBe(mockResponse);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 and returns the successful response on the second attempt', async () => {
    vi.useFakeTimers();
    const failResponse = {
      ok: false,
      status: 429,
      headers: { get: (h: string) => (h === 'Retry-After' ? '1' : null) },
    } as unknown as Response;
    const okResponse = { ok: true, status: 200 } as Response;
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(failResponse)
      .mockResolvedValueOnce(okResponse);
    vi.stubGlobal('fetch', mockFetch);

    const promise = fetchWithRetry('https://example.com', {});
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(okResponse);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting all 3 attempts', async () => {
    vi.useFakeTimers();
    const failResponse = {
      ok: false,
      status: 429,
      headers: { get: () => '1' },
    } as unknown as Response;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(failResponse));

    const promise = fetchWithRetry('https://example.com', {});
    const assertion = expect(promise).rejects.toThrow('Too many requests');
    await vi.runAllTimersAsync();
    await assertion;

    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('uses a 10-second default delay when Retry-After header is absent', async () => {
    vi.useFakeTimers();
    const failResponse = {
      ok: false,
      status: 429,
      headers: { get: () => null },
    } as unknown as Response;
    const okResponse = { ok: true, status: 200 } as Response;
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(failResponse)
      .mockResolvedValueOnce(okResponse);
    vi.stubGlobal('fetch', mockFetch);

    const promise = fetchWithRetry('https://example.com', {});
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe(okResponse);
  });
});
