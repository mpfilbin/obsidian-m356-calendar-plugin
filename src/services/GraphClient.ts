import { AuthService } from './AuthService';
import { fetchWithRetry } from '../lib/fetchWithRetry';
import { type Logger, NullLogger } from '../lib/logger';

export const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

/**
 * Builds an OData query string for Graph. Unlike `URLSearchParams`, this encodes spaces as `%20`
 * (not `+`) and leaves the `$` of `$filter` / `$select` literal. Graph's URI parser rejects
 * `+`-encoded spaces in `$filter` with a 400 "Invalid request" (RequestBroker--ParseUri).
 */
export function buildQuery(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([key, value]) => `${key.replace(/[^$\w.-]/g, encodeURIComponent)}=${encodeURIComponent(value)}`)
    .join('&');
}

/** A non-2xx response from Graph. `status` is the HTTP status code. */
export class GraphError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'GraphError';
  }
}

export interface GraphRequestOptions {
  /** JSON-serialisable request body; sets Content-Type to application/json. */
  body?: unknown;
  /** Extra headers merged after Authorization. */
  headers?: Record<string, string>;
}

/** Pulls the human-readable message out of a Graph error response, if there is one. */
async function readErrorDetail(response: Response): Promise<string | undefined> {
  if (typeof response.text !== 'function') return undefined;
  try {
    const text = await response.text();
    if (!text) return undefined;
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      return parsed.error?.message ?? text.slice(0, 200);
    } catch {
      return text.slice(0, 200);
    }
  } catch {
    return undefined;
  }
}

/**
 * Thin wrapper over Microsoft Graph: attaches the bearer token, retries on 429,
 * and turns non-2xx responses into errors that include Graph's own message.
 */
export class GraphClient {
  constructor(
    private readonly auth: AuthService,
    private readonly logger: Logger = new NullLogger(),
  ) {}

  /**
   * Sends a request and returns the raw response.
   * @param path Absolute URL, or a path relative to the Graph v1.0 root (e.g. `/me/events`).
   * @param what Verb phrase for the error message, e.g. "create event".
   */
  async send(method: string, path: string, what: string, opts: GraphRequestOptions = {}): Promise<Response> {
    const token = await this.auth.getValidToken();
    const url = path.startsWith('http') ? path : `${GRAPH_BASE}${path}`;
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    Object.assign(headers, opts.headers);
    const init: RequestInit = { headers };
    if (method !== 'GET') init.method = method;
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);

    const response = await fetchWithRetry(url, init, this.logger);
    if (!response.ok) {
      const detail = await readErrorDetail(response);
      const status = response.statusText || String(response.status ?? '');
      throw new GraphError(`Failed to ${what}: ${status}${detail ? ` (${detail})` : ''}`, response.status ?? 0);
    }
    return response;
  }

  async json<T>(method: string, path: string, what: string, opts: GraphRequestOptions = {}): Promise<T> {
    const response = await this.send(method, path, what, opts);
    return await response.json() as T;
  }

  /** Follows `@odata.nextLink` until exhausted and returns all `value` items. */
  async getAll<T>(path: string, what: string, opts: GraphRequestOptions = {}): Promise<T[]> {
    const items: T[] = [];
    let url: string | null = path;
    while (url) {
      const page: { value: T[]; '@odata.nextLink'?: string } = await this.json('GET', url, what, opts);
      items.push(...page.value);
      url = page['@odata.nextLink'] ?? null;
    }
    return items;
  }
}
