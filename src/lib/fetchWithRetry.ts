import type { Logger } from './logger';

const MAX_ATTEMPTS = 3;
const DEFAULT_429_DELAY_MS = 10_000;
const MAX_DELAY_MS = 60_000;
const BASE_BACKOFF_MS = 1_000;
const TRANSIENT_STATUSES = new Set([502, 503, 504]);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Parses Retry-After as delta-seconds or an HTTP date; returns undefined if absent/invalid. */
function parseRetryAfterMs(response: Response): number | undefined {
  const header = response.headers?.get('Retry-After');
  if (!header) return undefined;
  const seconds = parseInt(header, 10);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const date = Date.parse(header);
  if (Number.isFinite(date)) {
    const ms = date - Date.now();
    if (ms > 0) return ms;
  }
  return undefined;
}

/** Exponential backoff (1s, 2s, ...) with up to 50% added jitter so parallel callers spread out. */
function backoffMs(attempt: number): number {
  const base = BASE_BACKOFF_MS * 2 ** attempt;
  return base + Math.random() * base * 0.5;
}

/**
 * fetch with retries.
 * - 429: always retried (the server did not process the request), honouring a capped Retry-After.
 *   Gives up with "Too many requests".
 * - 502/503/504 and network errors: retried with backoff, but only for GET/HEAD, because
 *   repeating a write that may already have been applied could duplicate or conflict.
 *   After the last attempt a transient status is returned as-is; a network error is rethrown.
 */
export async function fetchWithRetry(url: string, options: RequestInit, logger?: Logger): Promise<Response> {
  const method = (options.method ?? 'GET').toUpperCase();
  const safeToRepeat = method === 'GET' || method === 'HEAD';
  logger?.log(`[M365] ${method} ${url}`);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const isLast = attempt === MAX_ATTEMPTS - 1;

    let response: Response;
    try {
      response = await fetch(url, options);
    } catch (e) {
      logger?.log(`[M365] ${method} ${url} → network error: ${e instanceof Error ? e.message : String(e)}`);
      if (!safeToRepeat || isLast) throw e;
      await sleep(backoffMs(attempt));
      continue;
    }
    logger?.log(`[M365] ${method} ${url} → ${response.status} ${response.statusText}`);

    if (response.status === 429) {
      if (!isLast) {
        const delay = parseRetryAfterMs(response) ?? DEFAULT_429_DELAY_MS;
        await sleep(Math.min(delay, MAX_DELAY_MS));
      }
      continue;
    }
    if (TRANSIENT_STATUSES.has(response.status) && safeToRepeat && !isLast) {
      const delay = parseRetryAfterMs(response) ?? backoffMs(attempt);
      await sleep(Math.min(delay, MAX_DELAY_MS));
      continue;
    }
    return response;
  }
  throw new Error('Too many requests');
}
