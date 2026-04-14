import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CacheService } from '../../src/services/CacheService';
import { M365Event, CacheStore } from '../../src/types';

const makeEvent = (id: string, startISO: string): M365Event => ({
  id,
  subject: `Event ${id}`,
  start: { dateTime: startISO, timeZone: 'UTC' },
  end: { dateTime: startISO, timeZone: 'UTC' },
  calendarId: 'cal1',
  isAllDay: false,
});

// April events (local midnight Dates → these ISOs represent local-time dates converted to UTC)
const APR_START = new Date(2026, 3, 1);   // April 1
const APR_END   = new Date(2026, 4, 1);   // May 1
const WEEK_START = new Date(2026, 3, 13); // April 13
const WEEK_END   = new Date(2026, 3, 20); // April 20

const evtApr4  = makeEvent('e1', '2026-04-04T09:00:00');
const evtApr15 = makeEvent('e2', '2026-04-15T10:00:00');
const evtMay1  = makeEvent('e3', '2026-05-01T08:00:00');

describe('CacheService', () => {
  let load: ReturnType<typeof vi.fn>;
  let save: ReturnType<typeof vi.fn>;
  let cache: CacheService;

  beforeEach(async () => {
    load = vi.fn().mockResolvedValue({});
    save = vi.fn().mockResolvedValue(undefined);
    cache = new CacheService(load, save);
    await cache.init();
  });

  // --- getEventsForRange ---

  it('returns null when no entry exists for calendar', () => {
    expect(cache.getEventsForRange('cal1', APR_START, APR_END)).toBeNull();
  });

  it('returns null when no interval covers the requested range', async () => {
    // Only April 1–15 stored; requesting April 13–20 (end not covered)
    await cache.addEvents('cal1', APR_START, WEEK_START, [evtApr4]);
    expect(cache.getEventsForRange('cal1', WEEK_START, WEEK_END)).toBeNull();
  });

  it('returns filtered events when range is fully covered', async () => {
    await cache.addEvents('cal1', APR_START, APR_END, [evtApr4, evtApr15, evtMay1]);
    const result = cache.getEventsForRange('cal1', WEEK_START, WEEK_END);
    expect(result).not.toBeNull();
    // Only evtApr15 (April 15) falls within April 13–20
    expect(result!.map((e) => e.id)).toEqual(['e2']);
  });

  it('serves a week-range request from a covering month-range entry', async () => {
    // The key scenario: month fetch covers week request
    await cache.addEvents('cal1', APR_START, APR_END, [evtApr4, evtApr15]);
    const result = cache.getEventsForRange('cal1', WEEK_START, WEEK_END);
    expect(result).not.toBeNull();
    expect(result!).toHaveLength(1);
    expect(result![0].id).toBe('e2');
  });

  it('returns empty array (not null) when range is covered but contains no events', async () => {
    await cache.addEvents('cal1', APR_START, APR_END, [evtApr4]);
    const result = cache.getEventsForRange('cal1', WEEK_START, WEEK_END);
    expect(result).not.toBeNull();
    expect(result).toEqual([]);
  });

  it('returns null when the covering interval is expired (>24h)', async () => {
    const staleStore: CacheStore = {
      cal1: {
        events: [evtApr15],
        intervals: [{
          start: APR_START.toISOString(),
          end: APR_END.toISOString(),
          fetchedAt: Date.now() - 25 * 60 * 60 * 1000,
        }],
      },
    };
    const staleCache = new CacheService(
      vi.fn().mockResolvedValue(staleStore),
      vi.fn().mockResolvedValue(undefined),
    );
    await staleCache.init();
    expect(staleCache.getEventsForRange('cal1', WEEK_START, WEEK_END)).toBeNull();
  });

  // --- addEvents ---

  it('persists via save when adding events', async () => {
    await cache.addEvents('cal1', APR_START, APR_END, [evtApr4]);
    expect(save).toHaveBeenCalled();
  });

  it('deduplicates events by id when adding overlapping fetches', async () => {
    await cache.addEvents('cal1', APR_START, APR_END, [evtApr4, evtApr15]);
    await cache.addEvents('cal1', WEEK_START, WEEK_END, [evtApr15]); // evtApr15 already stored
    const result = cache.getEventsForRange('cal1', APR_START, APR_END);
    const ids = result!.map((e) => e.id);
    expect(ids.filter((id) => id === 'e2')).toHaveLength(1); // no duplicate
  });

  it('upserts events: replaces existing event fields when id already exists', async () => {
    await cache.addEvents('cal1', APR_START, APR_END, [evtApr4]);
    const updated = { ...evtApr4, subject: 'Updated Subject' };
    await cache.addEvents('cal1', APR_START, APR_END, [updated]);
    const result = cache.getEventsForRange('cal1', APR_START, APR_END);
    expect(result!.filter((e) => e.id === evtApr4.id)).toHaveLength(1);
    expect(result!.find((e) => e.id === evtApr4.id)!.subject).toBe('Updated Subject');
  });

  it('accumulates multiple intervals for the same calendar', async () => {
    await cache.addEvents('cal1', APR_START, WEEK_START, [evtApr4]);
    await cache.addEvents('cal1', WEEK_START, APR_END, [evtApr15]);
    // Each sub-range covered by its own interval — neither alone covers April 1–May 1
    const fullRange = cache.getEventsForRange('cal1', APR_START, APR_END);
    // Neither stored interval covers the full range individually
    expect(fullRange).toBeNull();
  });

  // --- clearAll ---

  it('clearAll removes all calendar entries and persists the cleared store', async () => {
    await cache.addEvents('cal1', APR_START, APR_END, [evtApr4]);
    await cache.addEvents('cal2', APR_START, APR_END, [evtApr15]);
    save.mockClear();
    await cache.clearAll();
    expect(cache.getEventsForRange('cal1', APR_START, APR_END)).toBeNull();
    expect(cache.getEventsForRange('cal2', APR_START, APR_END)).toBeNull();
    expect(save).toHaveBeenCalledWith({});
  });

  // --- purgeExpired (via init) ---

  it('purges expired intervals on init, keeps fresh ones', async () => {
    const mixedStore: CacheStore = {
      cal1: {
        events: [evtApr4, evtApr15],
        intervals: [
          { start: APR_START.toISOString(), end: APR_END.toISOString(), fetchedAt: Date.now() - 25 * 60 * 60 * 1000 }, // stale
          { start: WEEK_START.toISOString(), end: WEEK_END.toISOString(), fetchedAt: Date.now() }, // fresh
        ],
      },
    };
    const c = new CacheService(vi.fn().mockResolvedValue(mixedStore), vi.fn().mockResolvedValue(undefined));
    await c.init();
    // Stale interval (April) purged; fresh interval (week) kept
    expect(c.getEventsForRange('cal1', APR_START, APR_END)).toBeNull(); // stale interval gone
    expect(c.getEventsForRange('cal1', WEEK_START, WEEK_END)).not.toBeNull(); // fresh interval still present
  });

  it('removes entire calendar entry when all intervals are expired', async () => {
    const staleStore: CacheStore = {
      cal1: {
        events: [evtApr4],
        intervals: [{
          start: APR_START.toISOString(),
          end: APR_END.toISOString(),
          fetchedAt: Date.now() - 25 * 60 * 60 * 1000,
        }],
      },
    };
    const c = new CacheService(vi.fn().mockResolvedValue(staleStore), vi.fn().mockResolvedValue(undefined));
    await c.init();
    expect(c.getEventsForRange('cal1', APR_START, APR_END)).toBeNull();
  });

  it('removes events not covered by remaining valid intervals after purge', async () => {
    const mixedStore: CacheStore = {
      cal1: {
        events: [evtApr4, evtApr15],
        intervals: [
          // Only the week interval survives (the month interval is stale)
          { start: APR_START.toISOString(), end: APR_END.toISOString(), fetchedAt: Date.now() - 25 * 60 * 60 * 1000 },
          { start: WEEK_START.toISOString(), end: WEEK_END.toISOString(), fetchedAt: Date.now() },
        ],
      },
    };
    const c = new CacheService(vi.fn().mockResolvedValue(mixedStore), vi.fn().mockResolvedValue(undefined));
    await c.init();
    const result = c.getEventsForRange('cal1', WEEK_START, WEEK_END);
    // evtApr4 (April 4) is outside the surviving week interval → should be purged
    expect(result!.map((e) => e.id)).toEqual(['e2']);
  });
});
