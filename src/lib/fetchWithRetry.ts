import type { Logger } from './logger';

const MAX_RETRIES = 3;

export async function fetchWithRetry(url: string, options: RequestInit, logger?: Logger): Promise<Response> {
  const method = options.method ?? 'GET';
  logger?.log(`[M365] ${method} ${url}`);
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetch(url, options);
    logger?.log(`[M365] ${method} ${url} → ${response.status} ${response.statusText}`);
    if (response.status !== 429) return response;
    if (attempt < MAX_RETRIES - 1) {
      const raw = parseInt(response.headers.get('Retry-After') ?? '', 10);
      const retryAfter = Number.isFinite(raw) && raw > 0 ? raw : 10;
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    }
  }
  throw new Error('Too many requests');
}
