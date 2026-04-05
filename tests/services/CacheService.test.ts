import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CacheService } from '../../src/services/CacheService';
import { M365Event, CacheStore } from '../../src/types';

const mockEvent: M365Event = {
  id: 'evt1',
  subject: 'Test Event',
  start: { dateTime: '2026-04-04T09:00:00Z', timeZone: 'UTC' },
  end: { dateTime: '2026-04-04T10:00:00Z', timeZone: 'UTC' },
  calendarId: 'cal1',
  isAllDay: false,
};

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

  it('returns null for missing key', () => {
    expect(cache.get('missing')).toBeNull();
  });

  it('stores and retrieves events', async () => {
    await cache.set('key1', [mockEvent]);
    const result = cache.get('key1');
    expect(result?.events).toEqual([mockEvent]);
  });

  it('returns null for expired entries (> 24h old)', async () => {
    const staleStore: CacheStore = {
      key1: { events: [mockEvent], fetchedAt: Date.now() - 25 * 60 * 60 * 1000 },
    };
    const expiredCache = new CacheService(
      vi.fn().mockResolvedValue(staleStore),
      vi.fn().mockResolvedValue(undefined),
    );
    await expiredCache.init();
    expect(expiredCache.get('key1')).toBeNull();
  });

  it('purges only expired entries on init, keeps fresh ones', async () => {
    const mixedStore: CacheStore = {
      old: { events: [mockEvent], fetchedAt: Date.now() - 25 * 60 * 60 * 1000 },
      fresh: { events: [mockEvent], fetchedAt: Date.now() },
    };
    const c = new CacheService(
      vi.fn().mockResolvedValue(mixedStore),
      vi.fn().mockResolvedValue(undefined),
    );
    await c.init();
    expect(c.get('old')).toBeNull();
    expect(c.get('fresh')).not.toBeNull();
  });

  it('calls save when setting events', async () => {
    await cache.set('key2', [mockEvent]);
    expect(save).toHaveBeenCalled();
  });

  it('fresh entry within 24h is returned', async () => {
    await cache.set('key3', [mockEvent]);
    expect(cache.get('key3')).not.toBeNull();
  });

  it('clearAll removes all entries', async () => {
    await cache.set('key1', [mockEvent]);
    await cache.set('key2', [mockEvent]);
    cache.clearAll();
    expect(cache.get('key1')).toBeNull();
    expect(cache.get('key2')).toBeNull();
  });
});
