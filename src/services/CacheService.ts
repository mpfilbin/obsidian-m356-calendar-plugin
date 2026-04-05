import { CachedEvents, CacheStore, M365Event } from '../types';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export class CacheService {
  private store: CacheStore = {};

  constructor(
    private readonly load: () => Promise<CacheStore>,
    private readonly save: (data: CacheStore) => Promise<void>,
  ) {}

  async init(): Promise<void> {
    const data = await this.load();
    this.store = data ?? {};
    this.purgeExpired();
  }

  get(key: string): CachedEvents | null {
    const entry = this.store[key];
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;
    return entry;
  }

  async set(key: string, events: M365Event[]): Promise<void> {
    this.store[key] = { events, fetchedAt: Date.now() };
    await this.save(this.store);
  }

  clearAll(): void {
    this.store = {};
  }

  purgeExpired(): void {
    const now = Date.now();
    for (const key of Object.keys(this.store)) {
      if (now - this.store[key].fetchedAt > CACHE_TTL_MS) {
        delete this.store[key];
      }
    }
  }
}
