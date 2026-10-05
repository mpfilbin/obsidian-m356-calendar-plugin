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

  const res = (status: number, retryAfter?: string) => ({
    ok: status < 400,
    status,
    statusText: '',
    headers: { get: (h: string) => (h === 'Retry-After' ? retryAfter ?? null : null) },
  }) as unknown as Response;

  it('retries a GET on 503 with backoff and returns the later success', async () => {
    vi.useFakeTimers();
    const ok = res(200);
    const mockFetch = vi.fn().mockResolvedValueOnce(res(503)).mockResolvedValueOnce(res(502)).mockResolvedValueOnce(ok);
    vi.stubGlobal('fetch', mockFetch);
    const promise = fetchWithRetry('https://example.com', {});
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe(ok);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('returns the last 503 response when retries run out (so callers can report it)', async () => {
    vi.useFakeTimers();
    const last = res(503);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(last));
    const promise = fetchWithRetry('https://example.com', {});
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe(last);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry a POST on 503 or on a network error', async () => {
    const r503 = res(503);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(r503));
    await expect(fetchWithRetry('https://example.com', { method: 'POST' })).resolves.toBe(r503);
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(fetchWithRetry('https://example.com', { method: 'POST' })).rejects.toThrow('Failed to fetch');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries a GET after a network error and rethrows once attempts are exhausted', async () => {
    vi.useFakeTimers();
    const ok = res(200);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(ok));
    const first = fetchWithRetry('https://example.com', {});
    await vi.runAllTimersAsync();
    await expect(first).resolves.toBe(ok);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const second = fetchWithRetry('https://example.com', {});
    const assertion = expect(second).rejects.toThrow('offline');
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry client errors such as 404', async () => {
    const r404 = res(404);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(r404));
    await expect(fetchWithRetry('https://example.com', {})).resolves.toBe(r404);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('caps an excessive Retry-After at 60 seconds', async () => {
    vi.useFakeTimers();
    const ok = res(200);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(res(429, '86400')).mockResolvedValueOnce(ok));
    const promise = fetchWithRetry('https://example.com', {});
    await vi.advanceTimersByTimeAsync(59_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_500);
    await expect(promise).resolves.toBe(ok);
  });

  it('honours an HTTP-date Retry-After', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const ok = res(200);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(res(429, 'Thu, 01 Jan 2026 00:00:05 GMT')).mockResolvedValueOnce(ok));
    const promise = fetchWithRetry('https://example.com', {});
    await vi.advanceTimersByTimeAsync(4_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_500);
    await expect(promise).resolves.toBe(ok);
  });
});
