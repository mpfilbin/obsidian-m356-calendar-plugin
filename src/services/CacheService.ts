import { CacheStore, M365Event } from '../types';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Event start/end are local wall-clock strings (requested via the Prefer timezone header).
// Zero-length events (end <= start) are treated as instants at `start`.
function overlaps(e: M365Event, rangeStart: Date, rangeEnd: Date): boolean {
  const eventStart = new Date(e.start.dateTime);
  const eventEnd = new Date(e.end.dateTime);
  if (!(eventEnd > eventStart)) return eventStart >= rangeStart && eventStart < rangeEnd;
  return eventStart < rangeEnd && eventEnd > rangeStart;
}

export class CacheService {
  private store: CacheStore = {};
  private clearCount = 0;

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
    const sizeBefore = Object.keys(this.store).length;
    this.purgeExpired();
    if (Object.keys(this.store).length !== sizeBefore) {
      await this.save(this.store);
    }
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
    // Overlap test, not start-in-range: a multi-day event that began before
    // `start` must still be returned, matching what a network fetch returns.
    return entry.events.filter((e) => overlaps(e, start, end));
  }

  /**
   * Changes every time the cache is cleared. A fetch that began before a clear can pass the epoch it
   * saw to `addEvents` so its (now stale) results are not written back after the purge.
   */
  get epoch(): number {
    return this.clearCount;
  }

  async addEvents(
    calendarId: string,
    start: Date,
    end: Date,
    events: M365Event[],
    expectedEpoch: number = this.clearCount,
  ): Promise<void> {
    if (expectedEpoch !== this.clearCount) return;
    const entry = this.store[calendarId] ?? { events: [], intervals: [] };
    const idToIndex = new Map(entry.events.map((e, i) => [e.id, i]));
    for (const event of events) {
      const idx = idToIndex.get(event.id);
      if (idx !== undefined) {
        entry.events[idx] = event;
      } else {
        idToIndex.set(event.id, entry.events.length);
        entry.events.push(event);
      }
    }
    entry.intervals.push({ start: start.toISOString(), end: end.toISOString(), fetchedAt: Date.now() });
    this.store[calendarId] = entry;
    await this.save(this.store);
  }

  async clearAll(): Promise<void> {
    this.clearCount++;
    this.store = {};
    await this.save(this.store);
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
        entry.intervals.some((iv) => overlaps(e, new Date(iv.start), new Date(iv.end))),
      );
    }
  }
}
