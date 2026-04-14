import { CacheStore, M365Event } from '../types';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export class CacheService {
  private store: CacheStore = {};

  constructor(
    private readonly load: () => Promise<CacheStore>,
    private readonly save: (data: CacheStore) => Promise<void>,
  ) {}

  async init(): Promise<void> {
    const data = await this.load();
    const raw = data ?? {};
    // Discard entries that don't match the current CalendarCacheEntry shape
    // (e.g. persisted data from the old exact-key cache format).
    this.store = Object.fromEntries(
      Object.entries(raw).filter(
        ([, v]) => Array.isArray((v as unknown as Record<string, unknown>).intervals),
      ),
    );
    this.purgeExpired();
  }

  getEventsForRange(calendarId: string, start: Date, end: Date): M365Event[] | null {
    const entry = this.store[calendarId];
    if (!entry) return null;
    const now = Date.now();
    const startISO = start.toISOString();
    const endISO = end.toISOString();
    const covered = entry.intervals.some(
      (iv) => iv.start <= startISO && iv.end >= endISO && now - iv.fetchedAt <= CACHE_TTL_MS,
    );
    if (!covered) return null;
    return entry.events.filter((e) => {
      const eventStart = new Date(e.start.dateTime);
      return eventStart >= start && eventStart < end;
    });
  }

  async addEvents(calendarId: string, start: Date, end: Date, events: M365Event[]): Promise<void> {
    const entry = this.store[calendarId] ?? { events: [], intervals: [] };
    const existingIds = new Set(entry.events.map((e) => e.id));
    for (const event of events) {
      if (!existingIds.has(event.id)) {
        entry.events.push(event);
        existingIds.add(event.id);
      }
    }
    entry.intervals.push({ start: start.toISOString(), end: end.toISOString(), fetchedAt: Date.now() });
    this.store[calendarId] = entry;
    await this.save(this.store);
  }

  clearAll(): void {
    this.store = {};
  }

  purgeExpired(): void {
    const now = Date.now();
    for (const calendarId of Object.keys(this.store)) {
      const entry = this.store[calendarId];
      entry.intervals = entry.intervals.filter((iv) => now - iv.fetchedAt <= CACHE_TTL_MS);
      if (entry.intervals.length === 0) {
        delete this.store[calendarId];
        continue;
      }
      entry.events = entry.events.filter((e) =>
        entry.intervals.some((iv) => {
          const eventStart = new Date(e.start.dateTime);
          const ivStart = new Date(iv.start);
          const ivEnd = new Date(iv.end);
          return eventStart >= ivStart && eventStart < ivEnd;
        }),
      );
    }
  }
}
