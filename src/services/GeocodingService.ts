import { requestUrl } from 'obsidian';
import { GeoPoint } from '../types';
import { type Logger, NullLogger } from '../lib/logger';

const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';

/** Nominatim's usage policy allows at most one request per second. */
const MIN_REQUEST_GAP_MS = 1100;

export interface GeocodeResult extends GeoPoint {
  /** The place the service matched, as it names it. */
  displayName: string;
}

/** A lookup failed (service busy or unreachable), as opposed to simply finding no match. */
export class GeocodingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeocodingError';
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Turns place text ("Pike Place Market, Seattle") into coordinates using OpenStreetMap's Nominatim
 * service. Lookups are cached for the session (so reopening an event costs nothing), identical
 * concurrent lookups share one request, and requests are spaced to respect the usage policy.
 */
export class GeocodingService {
  private readonly results = new Map<string, GeocodeResult | null>();
  private readonly inFlight = new Map<string, Promise<GeocodeResult | null>>();
  private nextSlot = 0;

  constructor(
    private readonly userAgent: string,
    private readonly logger: Logger = new NullLogger(),
  ) {}

  /** The best match for `query`, or null if the service knows no such place. */
  async geocode(query: string): Promise<GeocodeResult | null> {
    const key = query.trim().replace(/\s+/g, ' ').toLowerCase();
    if (!key) return null;
    if (this.results.has(key)) return this.results.get(key) ?? null;

    let pending = this.inFlight.get(key);
    if (!pending) {
      pending = this.lookup(query.trim().replace(/\s+/g, ' ')).then((result) => {
        this.results.set(key, result);
        return result;
      }).finally(() => {
        this.inFlight.delete(key);
      });
      this.inFlight.set(key, pending);
    }
    return pending;
  }

  private async lookup(query: string): Promise<GeocodeResult | null> {
    await this.waitForSlot();
    const url = `${NOMINATIM_SEARCH}?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
    this.logger.log('[M365 Maps] Looking up location via OpenStreetMap');
    let response;
    try {
      response = await requestUrl({
        url,
        method: 'GET',
        headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
        throw: false,
      });
    } catch (e) {
      this.logger.log('[M365 Maps] lookup failed:', e instanceof Error ? e.message : String(e));
      throw new GeocodingError('Could not reach the map service. Check your internet connection.');
    }
    this.logger.log('[M365 Maps] lookup response: status', response.status);

    if (response.status === 429) {
      throw new GeocodingError('The map service is busy. Try again in a moment.');
    }
    if (response.status >= 400) {
      throw new GeocodingError(`The map service returned an error (HTTP ${response.status}).`);
    }
    const first = (response.json as Array<{ lat?: string; lon?: string; display_name?: string }> | null)?.[0];
    const lat = Number(first?.lat);
    const lon = Number(first?.lon);
    if (!first || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon, displayName: first.display_name ?? query };
  }

  /** Waits until at least MIN_REQUEST_GAP_MS has passed since the previous request started. */
  private async waitForSlot(): Promise<void> {
    const now = Date.now();
    const start = Math.max(now, this.nextSlot);
    this.nextSlot = start + MIN_REQUEST_GAP_MS;
    if (start > now) await sleep(start - now);
  }
}
