# Rate Limiting & Caching Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Microsoft Graph API 429 errors when multiple calendars are selected by throttling concurrent requests, retrying on rate limits, and introducing an interval-coverage cache so switching views reuses already-fetched events.

**Architecture:** Replace the exact-range-key cache with a per-calendar interval store that can serve any range subset from previously fetched data. Add a `Semaphore` to cap concurrent Graph calls at 2, and a `fetchWithRetry` helper that backs off on 429 using the `Retry-After` header. Surface background fetch failures as a subtle toolbar indicator instead of a blocking error banner.

**Tech Stack:** TypeScript, React, Vitest, Microsoft Graph REST API

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/types/index.ts` | Modify | Replace `CachedEvents`/`CacheStore` types with `CalendarCacheEntry`/`CacheStore` |
| `src/lib/semaphore.ts` | Create | Concurrency limiter (max N simultaneous async operations) |
| `src/services/CacheService.ts` | Rewrite | Interval-coverage cache: `getEventsForRange`, `addEvents`, `clearAll`, `init` |
| `src/services/CalendarService.ts` | Modify | Use new cache API; add `Semaphore`; add `fetchWithRetry` |
| `src/components/CalendarApp.tsx` | Modify | Add `refreshFailed` state; route background failures away from error banner |
| `src/components/Toolbar.tsx` | Modify | Accept and render `refreshFailed` as subtle warning on refresh button |
| `tests/services/CacheService.test.ts` | Rewrite | Tests for interval coverage, range filtering, expiry purge |
| `tests/lib/semaphore.test.ts` | Create | Tests for acquire/release, concurrency cap, queue ordering |
| `tests/services/CalendarService.test.ts` | Modify | Update cache mock to new API; add 429 retry tests |

---

## Task 1: Update types and rewrite CacheService

**Files:**
- Modify: `src/types/index.ts`
- Rewrite: `src/services/CacheService.ts`
- Rewrite: `tests/services/CacheService.test.ts`

- [ ] **Step 1: Update `src/types/index.ts`**

Remove `CachedEvents` and replace `CacheStore` with the interval-coverage types:

```typescript
// Remove these two interfaces entirely:
// export interface CachedEvents { ... }
// export interface CacheStore { [key: string]: CachedEvents; }

// Add these in their place:
export interface CalendarCacheEntry {
  events: M365Event[];
  intervals: Array<{ start: string; end: string; fetchedAt: number }>;
}

export type CacheStore = Record<string, CalendarCacheEntry>;
```

The full updated `src/types/index.ts` (unchanged lines included for clarity):

```typescript
export interface M365Calendar {
  id: string;
  name: string;
  color: string;
  isDefaultCalendar: boolean;
  canEdit: boolean;
}

export interface M365Event {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  calendarId: string;
  isAllDay: boolean;
  bodyPreview?: string;
  webLink?: string;
  location?: string;
}

export interface NewEventInput {
  subject: string;
  start: Date;
  end: Date;
  description?: string;
  isAllDay?: boolean;
}

export interface EventPatch {
  subject?: string;
  location?: string;
  isAllDay?: boolean;
  start?: { dateTime: string; timeZone: string };
  end?: { dateTime: string; timeZone: string };
  bodyContent?: string;
}

export interface CalendarCacheEntry {
  events: M365Event[];
  intervals: Array<{ start: string; end: string; fetchedAt: number }>;
}

export type CacheStore = Record<string, CalendarCacheEntry>;

export interface M365CalendarSettings {
  clientId: string;
  tenantId: string;
  enabledCalendarIds: string[];
  defaultCalendarId: string;
  refreshIntervalMinutes: number;
  defaultView: 'month' | 'week' | 'day';
}

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}
```

- [ ] **Step 2: Write the failing CacheService tests**

Replace the entire contents of `tests/services/CacheService.test.ts`:

```typescript
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

  it('accumulates multiple intervals for the same calendar', async () => {
    await cache.addEvents('cal1', APR_START, WEEK_START, [evtApr4]);
    await cache.addEvents('cal1', WEEK_START, APR_END, [evtApr15]);
    // Each sub-range covered by its own interval — neither alone covers April 1–May 1
    const fullRange = cache.getEventsForRange('cal1', APR_START, APR_END);
    // Neither stored interval covers the full range individually
    expect(fullRange).toBeNull();
  });

  // --- clearAll ---

  it('clearAll removes all calendar entries', async () => {
    await cache.addEvents('cal1', APR_START, APR_END, [evtApr4]);
    await cache.addEvents('cal2', APR_START, APR_END, [evtApr15]);
    cache.clearAll();
    expect(cache.getEventsForRange('cal1', APR_START, APR_END)).toBeNull();
    expect(cache.getEventsForRange('cal2', APR_START, APR_END)).toBeNull();
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
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
npx vitest run tests/services/CacheService.test.ts
```

Expected: multiple failures referencing `getEventsForRange` and `addEvents` not found.

- [ ] **Step 4: Rewrite `src/services/CacheService.ts`**

```typescript
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
    this.store = data ?? {};
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
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx vitest run tests/services/CacheService.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Confirm no TypeScript errors**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```
git add src/types/index.ts src/services/CacheService.ts tests/services/CacheService.test.ts
git commit -m "feat: replace exact-key cache with interval-coverage cache"
```

---

## Task 2: Add Semaphore utility

**Files:**
- Create: `src/lib/semaphore.ts`
- Create: `tests/lib/semaphore.test.ts`

- [ ] **Step 1: Write the failing Semaphore tests**

Create `tests/lib/semaphore.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { Semaphore } from '../../src/lib/semaphore';

describe('Semaphore', () => {
  it('allows up to limit concurrent acquisitions immediately', async () => {
    const sem = new Semaphore(2);
    // Both should resolve without yielding
    const p1 = sem.acquire();
    const p2 = sem.acquire();
    let resolved = 0;
    void p1.then(() => resolved++);
    void p2.then(() => resolved++);
    await Promise.resolve();
    expect(resolved).toBe(2);
  });

  it('queues acquisition when at limit', async () => {
    const sem = new Semaphore(2);
    await sem.acquire();
    await sem.acquire();
    let thirdResolved = false;
    const p3 = sem.acquire().then(() => { thirdResolved = true; });
    await Promise.resolve();
    expect(thirdResolved).toBe(false); // still queued
    sem.release();
    await p3;
    expect(thirdResolved).toBe(true);
  });

  it('processes queued acquisitions in FIFO order', async () => {
    const sem = new Semaphore(1);
    await sem.acquire(); // slot taken
    const order: number[] = [];
    const p1 = sem.acquire().then(() => order.push(1));
    const p2 = sem.acquire().then(() => order.push(2));
    const p3 = sem.acquire().then(() => order.push(3));
    sem.release(); await Promise.resolve(); await Promise.resolve();
    sem.release(); await Promise.resolve(); await Promise.resolve();
    sem.release(); await Promise.resolve(); await Promise.resolve();
    await Promise.all([p1, p2, p3]);
    expect(order).toEqual([1, 2, 3]);
  });

  it('correctly tracks running count after multiple acquire/release cycles', async () => {
    const sem = new Semaphore(2);
    await sem.acquire();
    await sem.acquire();
    sem.release();
    // One slot now free; next acquire should resolve immediately
    let resolved = false;
    await sem.acquire().then(() => { resolved = true; });
    expect(resolved).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/lib/semaphore.test.ts
```

Expected: fail with module not found.

- [ ] **Step 3: Implement `src/lib/semaphore.ts`**

```typescript
export class Semaphore {
  private running = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  acquire(): Promise<void> {
    if (this.running < this.limit) {
      this.running++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      this.running++;
      next();
    }
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/lib/semaphore.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```
git add src/lib/semaphore.ts tests/lib/semaphore.test.ts
git commit -m "feat: add Semaphore concurrency limiter"
```

---

## Task 3: Update CalendarService

Update `CalendarService` to use the new cache API, a `Semaphore`, and a `fetchWithRetry` helper. Update the existing tests and add new ones for throttling and 429 retry.

**Files:**
- Modify: `src/services/CalendarService.ts`
- Modify: `tests/services/CalendarService.test.ts`

- [ ] **Step 1: Update the CalendarService test file**

Replace the entire `tests/services/CalendarService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CalendarService } from '../../src/services/CalendarService';
import { AuthService } from '../../src/services/AuthService';
import { CacheService } from '../../src/services/CacheService';
import { M365Event } from '../../src/types';

const FAKE_EVENT_RESPONSE = {
  id: 'evt1',
  subject: 'Team Standup',
  start: { dateTime: '2026-04-04T09:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-04T09:30:00', timeZone: 'UTC' },
  isAllDay: false,
  bodyPreview: '',
  webLink: 'https://outlook.office.com/calendar/item/evt1',
};

const EXPECTED_EVENT: M365Event = {
  id: 'evt1',
  subject: 'Team Standup',
  start: { dateTime: '2026-04-04T09:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-04T09:30:00', timeZone: 'UTC' },
  calendarId: 'cal1',
  isAllDay: false,
  bodyPreview: '',
  webLink: 'https://outlook.office.com/calendar/item/evt1',
};

describe('CalendarService', () => {
  let auth: Pick<AuthService, 'getValidToken'>;
  let cache: Pick<CacheService, 'getEventsForRange' | 'addEvents' | 'clearAll'>;
  let service: CalendarService;

  beforeEach(() => {
    auth = { getValidToken: vi.fn().mockResolvedValue('token') };
    cache = {
      getEventsForRange: vi.fn().mockReturnValue(null),
      addEvents: vi.fn().mockResolvedValue(undefined),
      clearAll: vi.fn(),
    };
    service = new CalendarService(auth as AuthService, cache as CacheService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('getCalendars maps Graph response correctly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        value: [{
          id: 'cal1',
          name: 'My Calendar',
          hexColor: '#0078d4',
          isDefaultCalendar: true,
          canEdit: true,
        }],
      }),
    }));
    const calendars = await service.getCalendars();
    expect(calendars).toHaveLength(1);
    expect(calendars[0]).toEqual({
      id: 'cal1',
      name: 'My Calendar',
      color: '#0078d4',
      isDefaultCalendar: true,
      canEdit: true,
    });
  });

  it('getCalendars throws when Graph returns error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Unauthorized',
    }));
    await expect(service.getCalendars()).rejects.toThrow('Failed to fetch calendars: Unauthorized');
  });

  it('getEvents returns cached events when interval covers range', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    (cache.getEventsForRange as ReturnType<typeof vi.fn>).mockReturnValue([EXPECTED_EVENT]);
    const events = await service.getEvents(['cal1'], new Date('2026-04-01'), new Date('2026-04-30'));
    expect(events).toEqual([EXPECTED_EVENT]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('getEvents fetches from Graph on cache miss and calls addEvents', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ value: [FAKE_EVENT_RESPONSE] }),
    }));
    const events = await service.getEvents(['cal1'], new Date('2026-04-01'), new Date('2026-04-30'));
    expect(events[0].subject).toBe('Team Standup');
    expect(events[0].calendarId).toBe('cal1');
    expect(cache.addEvents).toHaveBeenCalled();
  });

  it('getEvents merges events from multiple calendars', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ value: [FAKE_EVENT_RESPONSE] }),
    }));
    const events = await service.getEvents(
      ['cal1', 'cal2'],
      new Date('2026-04-01'),
      new Date('2026-04-30'),
    );
    expect(events).toHaveLength(2);
  });

  it('getEvents maps location displayName from Graph response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        value: [{
          id: 'evt1',
          subject: 'Team Standup',
          start: { dateTime: '2026-04-04T09:00:00', timeZone: 'UTC' },
          end: { dateTime: '2026-04-04T09:30:00', timeZone: 'UTC' },
          isAllDay: false,
          bodyPreview: '',
          webLink: 'https://outlook.office.com/calendar/item/evt1',
          location: { displayName: 'Conference Room A' },
        }],
      }),
    }));
    const events = await service.getEvents(['cal1'], new Date('2026-04-01'), new Date('2026-04-30'));
    expect(events[0].location).toBe('Conference Room A');
  });

  it('getEvents sets location to undefined when Graph response has no location', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ value: [FAKE_EVENT_RESPONSE] }),
    }));
    const events = await service.getEvents(['cal1'], new Date('2026-04-01'), new Date('2026-04-30'));
    expect(events[0].location).toBeUndefined();
  });

  it('getEvents follows @odata.nextLink to collect all pages', async () => {
    const page2Event = { ...FAKE_EVENT_RESPONSE, id: 'evt2', subject: 'Second Event' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          value: [FAKE_EVENT_RESPONSE],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/calendars/cal1/calendarView?$skiptoken=abc',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ value: [page2Event] }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const events = await service.getEvents(['cal1'], new Date('2026-04-01'), new Date('2026-05-01'));
    expect(events).toHaveLength(2);
    expect(events[0].id).toBe('evt1');
    expect(events[1].id).toBe('evt2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://graph.microsoft.com/v1.0/me/calendars/cal1/calendarView?$skiptoken=abc',
    );
  });

  it('getEvents requests $top=999 to minimize pagination round-trips', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ value: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await service.getEvents(['cal1'], new Date('2026-04-01'), new Date('2026-05-01'));
    const url: string = fetchMock.mock.calls[0][0];
    expect(decodeURIComponent(url)).toContain('$top=999');
  });

  // --- 429 retry ---

  it('getEvents retries on 429 and succeeds after Retry-After delay', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: (h: string) => (h === 'Retry-After' ? '1' : null) },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ value: [FAKE_EVENT_RESPONSE] }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const promise = service.getEvents(['cal1'], new Date('2026-04-01'), new Date('2026-05-01'));
    await vi.runAllTimersAsync();
    const events = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(events).toHaveLength(1);
  });

  it('getEvents throws after 3 failed 429 attempts', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: (h: string) => (h === 'Retry-After' ? '1' : null) },
    });
    vi.stubGlobal('fetch', fetchMock);
    const promise = service.getEvents(['cal1'], new Date('2026-04-01'), new Date('2026-05-01'));
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow('Failed to fetch events: Too Many Requests');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('getEvents falls back to 10s delay when Retry-After header is absent', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: () => null }, // no Retry-After header
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ value: [] }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const promise = service.getEvents(['cal1'], new Date('2026-04-01'), new Date('2026-05-01'));
    await vi.runAllTimersAsync();
    await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // --- createEvent / updateEvent / deleteEvent (unchanged behavior) ---

  it('createEvent posts to Graph and returns mapped event', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: 'evt2',
        subject: 'New Event',
        start: { dateTime: '2026-04-05T10:00:00', timeZone: 'UTC' },
        end: { dateTime: '2026-04-05T11:00:00', timeZone: 'UTC' },
        isAllDay: false,
        bodyPreview: undefined,
        webLink: undefined,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const event = await service.createEvent('cal1', {
      subject: 'New Event',
      start: new Date('2026-04-05T10:00:00Z'),
      end: new Date('2026-04-05T11:00:00Z'),
    });
    expect(event.subject).toBe('New Event');
    expect(event.calendarId).toBe('cal1');
    expect(event.id).toBe('evt2');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.start.dateTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(body.end.dateTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(body.start.timeZone).toBeTruthy();
    expect(body.end.timeZone).toBeTruthy();
  });

  it('createEvent clears the cache on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: 'evt2',
        subject: 'New Event',
        start: { dateTime: '2026-04-05T10:00:00Z', timeZone: 'UTC' },
        end: { dateTime: '2026-04-05T11:00:00Z', timeZone: 'UTC' },
        isAllDay: false,
      }),
    }));
    await service.createEvent('cal1', {
      subject: 'New Event',
      start: new Date('2026-04-05T10:00:00Z'),
      end: new Date('2026-04-05T11:00:00Z'),
    });
    expect(cache.clearAll).toHaveBeenCalled();
  });

  it('createEvent sends midnight local-date format for all-day events', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: 'evt-allday',
        subject: 'All Day Event',
        start: { dateTime: '2026-04-10T00:00:00', timeZone: 'UTC' },
        end: { dateTime: '2026-04-11T00:00:00', timeZone: 'UTC' },
        isAllDay: true,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await service.createEvent('cal1', {
      subject: 'All Day Event',
      start: new Date('2026-04-10'),
      end: new Date('2026-04-11'),
      isAllDay: true,
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.start.dateTime).toBe('2026-04-10T00:00:00');
    expect(body.end.dateTime).toBe('2026-04-11T00:00:00');
    expect(body.isAllDay).toBe(true);
  });

  it('updateEvent sends PATCH to /me/events/{id} with correct body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await service.updateEvent('evt1', { subject: 'Updated', location: 'Room 42' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/me/events/evt1',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          Authorization: 'Bearer token',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.subject).toBe('Updated');
    expect(body.location).toEqual({ displayName: 'Room 42' });
  });

  it('updateEvent clears the cache on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    await service.updateEvent('evt1', { subject: 'Updated' });
    expect(cache.clearAll).toHaveBeenCalled();
  });

  it('updateEvent omits undefined fields from PATCH body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await service.updateEvent('evt1', { subject: 'Only Subject' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual({ subject: 'Only Subject' });
    expect(body.location).toBeUndefined();
  });

  it('updateEvent throws when Graph returns error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Forbidden' }));
    await expect(service.updateEvent('evt1', { subject: 'x' })).rejects.toThrow(
      'Failed to update event: Forbidden',
    );
  });

  it('deleteEvent sends DELETE to /me/events/{id} with correct auth header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await service.deleteEvent('evt1');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/me/events/evt1',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      }),
    );
  });

  it('deleteEvent clears the cache on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    await service.deleteEvent('evt1');
    expect(cache.clearAll).toHaveBeenCalled();
  });

  it('deleteEvent throws when Graph returns error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Not Found' }));
    await expect(service.deleteEvent('evt1')).rejects.toThrow('Failed to delete event: Not Found');
  });
});
```

- [ ] **Step 2: Run tests to confirm failures are the expected ones**

```bash
npx vitest run tests/services/CalendarService.test.ts
```

Expected: failures on `getEventsForRange`, `addEvents`, retry tests. The `getCalendars`, `createEvent`, `updateEvent`, `deleteEvent` tests should still pass.

- [ ] **Step 3: Update `src/services/CalendarService.ts`**

Replace the entire file:

```typescript
import { M365Calendar, M365Event, NewEventInput, EventPatch } from '../types';
import { AuthService } from './AuthService';
import { CacheService } from './CacheService';
import { Semaphore } from '../lib/semaphore';
import { toLocalISOString } from '../lib/datetime';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

export class CalendarService {
  private readonly semaphore = new Semaphore(2);

  constructor(
    private readonly auth: AuthService,
    private readonly cache: CacheService,
  ) {}

  async getCalendars(): Promise<M365Calendar[]> {
    const token = await this.auth.getValidToken();
    const response = await fetch(`${GRAPH_BASE}/me/calendars`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Failed to fetch calendars: ${response.statusText}`);
    const data = await response.json();
    return data.value.map((c: Record<string, unknown>) => ({
      id: c.id,
      name: c.name,
      color: (c.hexColor as string) || '#0078d4',
      isDefaultCalendar: (c.isDefaultCalendar as boolean) ?? false,
      canEdit: (c.canEdit as boolean) ?? false,
    }));
  }

  async getEvents(calendarIds: string[], start: Date, end: Date): Promise<M365Event[]> {
    const results = await Promise.all(
      calendarIds.map((id) => this.getEventsForCalendar(id, start, end)),
    );
    return results.flat();
  }

  async createEvent(calendarId: string, input: NewEventInput): Promise<M365Event> {
    const token = await this.auth.getValidToken();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const isAllDay = input.isAllDay ?? false;
    const formatDateTime = (d: Date) =>
      isAllDay ? `${d.toISOString().slice(0, 10)}T00:00:00` : toLocalISOString(d);
    const body = {
      subject: input.subject,
      body: { contentType: 'text', content: input.description ?? '' },
      start: { dateTime: formatDateTime(input.start), timeZone },
      end: { dateTime: formatDateTime(input.end), timeZone },
      isAllDay,
    };
    const response = await fetch(`${GRAPH_BASE}/me/calendars/${calendarId}/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Failed to create event: ${response.statusText}`);
    const data = await response.json();
    this.cache.clearAll();
    return this.mapEvent(data, calendarId);
  }

  async updateEvent(eventId: string, patch: EventPatch): Promise<void> {
    const token = await this.auth.getValidToken();
    const body: Record<string, unknown> = {};
    if (patch.subject !== undefined) body.subject = patch.subject;
    if (patch.location !== undefined) body.location = { displayName: patch.location };
    if (patch.isAllDay !== undefined) body.isAllDay = patch.isAllDay;
    if (patch.start !== undefined) body.start = patch.start;
    if (patch.end !== undefined) body.end = patch.end;
    if (patch.bodyContent !== undefined) body.body = { contentType: 'text', content: patch.bodyContent };
    const response = await fetch(`${GRAPH_BASE}/me/events/${eventId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Failed to update event: ${response.statusText}`);
    this.cache.clearAll();
  }

  async deleteEvent(eventId: string): Promise<void> {
    const token = await this.auth.getValidToken();
    const response = await fetch(`${GRAPH_BASE}/me/events/${eventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Failed to delete event: ${response.statusText}`);
    this.cache.clearAll();
  }

  private async getEventsForCalendar(
    calendarId: string,
    start: Date,
    end: Date,
  ): Promise<M365Event[]> {
    const cached = this.cache.getEventsForRange(calendarId, start, end);
    if (cached !== null) return cached;

    await this.semaphore.acquire();
    try {
      const token = await this.auth.getValidToken();
      const params = new URLSearchParams({
        startDateTime: start.toISOString(),
        endDateTime: end.toISOString(),
        $select: 'id,subject,start,end,isAllDay,bodyPreview,webLink,location',
        $top: '999',
      });
      const events: M365Event[] = [];
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      let url: string | null = `${GRAPH_BASE}/me/calendars/${calendarId}/calendarView?${params}`;
      while (url) {
        const response = await this.fetchWithRetry(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Prefer: `outlook.timezone="${timeZone}"`,
          },
        });
        if (!response.ok) throw new Error(`Failed to fetch events: ${response.statusText}`);
        const data = await response.json() as Record<string, unknown>;
        (data.value as Record<string, unknown>[]).forEach((e) => events.push(this.mapEvent(e, calendarId)));
        url = (data['@odata.nextLink'] as string | undefined) ?? null;
      }
      await this.cache.addEvents(calendarId, start, end, events);
      return events;
    } finally {
      this.semaphore.release();
    }
  }

  private async fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const response = await fetch(url, options);
      if (response.status !== 429) return response;
      if (attempt < MAX_RETRIES - 1) {
        const retryAfter = parseInt(response.headers.get('Retry-After') ?? '10', 10);
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      }
    }
    throw new Error('Failed to fetch events: Too Many Requests');
  }

  private mapEvent(e: Record<string, unknown>, calendarId: string): M365Event {
    return {
      id: e.id as string,
      subject: e.subject as string,
      start: e.start as { dateTime: string; timeZone: string },
      end: e.end as { dateTime: string; timeZone: string },
      calendarId,
      isAllDay: (e.isAllDay as boolean) ?? false,
      bodyPreview: e.bodyPreview as string | undefined,
      webLink: e.webLink as string | undefined,
      location: (e.location as { displayName?: string } | undefined)?.displayName,
    };
  }
}
```

- [ ] **Step 4: Run CalendarService tests**

```bash
npx vitest run tests/services/CalendarService.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Confirm no TypeScript errors**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```
git add src/services/CalendarService.ts tests/services/CalendarService.test.ts
git commit -m "feat: add request throttling and 429 retry to CalendarService"
```

---

## Task 4: Update CalendarApp and Toolbar for stale-while-revalidate UX

**Files:**
- Modify: `src/components/CalendarApp.tsx`
- Modify: `src/components/Toolbar.tsx`

- [ ] **Step 1: Update `src/components/Toolbar.tsx`**

Add `refreshFailed` to props and render a warning state on the refresh button:

```typescript
import React from 'react';

type ViewType = 'month' | 'week' | 'day';

interface ToolbarProps {
  currentDate: Date;
  view: ViewType;
  onViewChange: (view: ViewType) => void;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  onRefresh: () => void;
  onNewEvent: () => void;
  syncing: boolean;
  refreshFailed: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  currentDate,
  view,
  onViewChange,
  onNavigate,
  onRefresh,
  onNewEvent,
  syncing,
  refreshFailed,
}) => {
  const label =
    view === 'month'
      ? currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : view === 'week'
      ? `Week of ${currentDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
      : currentDate.toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        });

  const refreshLabel = syncing ? '↻ Syncing…' : refreshFailed ? '⚠ ↻' : '↻';
  const refreshTitle = refreshFailed ? 'Last refresh failed — click to retry' : undefined;

  return (
    <div className="m365-calendar-toolbar">
      <div className="m365-calendar-nav">
        <button onClick={() => onNavigate('prev')}>‹</button>
        <button onClick={() => onNavigate('today')}>Today</button>
        <button onClick={() => onNavigate('next')}>›</button>
        <span className="m365-calendar-date-label">{label}</span>
      </div>
      <div className="m365-calendar-view-toggle">
        <button
          className={view === 'month' ? 'active' : ''}
          onClick={() => onViewChange('month')}
        >
          Month
        </button>
        <button
          className={view === 'week' ? 'active' : ''}
          onClick={() => onViewChange('week')}
        >
          Week
        </button>
      </div>
      <div className="m365-toolbar-actions">
        <button className="m365-new-event-btn" onClick={onNewEvent}>
          + New event
        </button>
        <button
          className={`m365-calendar-refresh${refreshFailed ? ' m365-refresh-failed' : ''}`}
          onClick={onRefresh}
          disabled={syncing}
          title={refreshTitle}
        >
          {refreshLabel}
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Update `src/components/CalendarApp.tsx`**

Add `refreshFailed` state and route background errors away from `setError`. Changes are in `fetchAll` and the `Toolbar` render:

```typescript
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Notice } from 'obsidian';
import { M365Calendar, M365Event } from '../types';
import { Toolbar } from './Toolbar';
import { CalendarSelector } from './CalendarSelector';
import { MonthView } from './MonthView';
import { WeekView } from './WeekView';
import { DayView } from './DayView';
import { CreateEventModal } from './CreateEventModal';
import { EventDetailModal } from './EventDetailModal';
import { useAppContext } from '../context';

type ViewType = 'month' | 'week' | 'day';

function notifyError(e: unknown): void {
  const message = e instanceof Error ? e.message : 'An error occurred';
  console.error('M365 Calendar:', e);
  new Notice(`M365 Calendar: ${message}`);
}

function getDateRange(date: Date, view: ViewType): { start: Date; end: Date } {
  if (view === 'month') {
    return {
      start: new Date(date.getFullYear(), date.getMonth(), 1),
      end: new Date(date.getFullYear(), date.getMonth() + 1, 1),
    };
  }
  if (view === 'day') {
    return {
      start: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
      end: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1),
    };
  }
  // week
  const sunday = new Date(date);
  sunday.setDate(date.getDate() - date.getDay());
  sunday.setHours(0, 0, 0, 0);
  const nextSunday = new Date(sunday);
  nextSunday.setDate(sunday.getDate() + 7);
  return { start: sunday, end: nextSunday };
}

export const CalendarApp: React.FC = () => {
  const { app, calendarService, settings, saveSettings } = useAppContext();
  const [view, setView] = useState<ViewType>(settings.defaultView);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendars, setCalendars] = useState<M365Calendar[]>([]);
  const [events, setEvents] = useState<M365Event[]>([]);
  const [enabledIds, setEnabledIds] = useState<string[]>(settings.enabledCalendarIds);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);

  const calendarsLoadedRef = useRef(false);

  const fetchAll = useCallback(async (options: { reloadCalendars?: boolean; userInitiated?: boolean } = {}) => {
    setSyncing(true);
    setError(null);
    setRefreshFailed(false);
    try {
      if (!calendarsLoadedRef.current || options.reloadCalendars) {
        calendarsLoadedRef.current = true;
        const fetchedCalendars = await calendarService.getCalendars();
        setCalendars(fetchedCalendars);
      }
      if (enabledIds.length > 0) {
        const { start, end } = getDateRange(currentDate, view);
        const fetched = await calendarService.getEvents(enabledIds, start, end);
        setEvents(fetched);
      } else {
        setEvents([]);
      }
    } catch (e) {
      calendarsLoadedRef.current = false;
      console.error('M365 Calendar:', e);
      if (options.userInitiated) {
        notifyError(e);
        setError(e instanceof Error ? e.message : 'Failed to load calendar data');
      } else {
        setRefreshFailed(true);
      }
    } finally {
      setSyncing(false);
    }
  }, [calendarService, enabledIds, currentDate, view]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const ms = settings.refreshIntervalMinutes * 60 * 1000;
    const interval = setInterval(() => void fetchAll({ reloadCalendars: true }), ms);
    return () => clearInterval(interval);
  }, [fetchAll, settings.refreshIntervalMinutes]);

  const handleNavigate = (direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      setCurrentDate(new Date());
      return;
    }
    const d = new Date(currentDate);
    if (view === 'month') {
      d.setMonth(d.getMonth() + (direction === 'next' ? 1 : -1));
    } else if (view === 'day') {
      d.setDate(d.getDate() + (direction === 'next' ? 1 : -1));
    } else {
      d.setDate(d.getDate() + (direction === 'next' ? 7 : -7));
    }
    setCurrentDate(d);
  };

  const handleToggleCalendar = async (calendarId: string) => {
    const next = enabledIds.includes(calendarId)
      ? enabledIds.filter((id) => id !== calendarId)
      : [...enabledIds, calendarId];
    setEnabledIds(next);
    try {
      await saveSettings({ ...settings, enabledCalendarIds: next });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save settings');
      setEnabledIds(enabledIds);
    }
  };

  const openCreateEventModal = (date: Date) => {
    const enabledCalendars = calendars.filter((c) => enabledIds.includes(c.id));
    if (enabledCalendars.length === 0) {
      new Notice('Enable at least one calendar to create events.');
      return;
    }
    new CreateEventModal(
      app,
      enabledCalendars,
      settings.defaultCalendarId,
      date,
      async (calendarId, event) => {
        try {
          const created = await calendarService.createEvent(calendarId, event);
          setEvents((prev) =>
            [...prev, created].sort(
              (a, b) => new Date(a.start.dateTime).getTime() - new Date(b.start.dateTime).getTime(),
            ),
          );
        } catch (e) {
          notifyError(e);
          throw e;
        }
      },
    ).open();
  };

  const handleDayClick = (date: Date) => {
    setView('day');
    setCurrentDate(date);
  };

  const handleEventClick = (event: M365Event) => {
    const calendar = calendars.find((c) => c.id === event.calendarId);
    const onDelete = calendar?.canEdit
      ? async () => {
          await calendarService.deleteEvent(event.id);
          setEvents((prev) => prev.filter((e) => e.id !== event.id));
          new Notice('Event deleted');
        }
      : undefined;
    new EventDetailModal(
      app,
      event,
      async (patch) => {
        try {
          await calendarService.updateEvent(event.id, patch);
        } catch (e) {
          notifyError(e);
          throw e;
        }
      },
      () => void fetchAll({ reloadCalendars: false }),
      onDelete,
    ).open();
  };

  return (
    <div className="m365-calendar">
      {error && <div className="m365-calendar-error">{error}</div>}
      <Toolbar
        currentDate={currentDate}
        view={view}
        onViewChange={setView}
        onNavigate={handleNavigate}
        onNewEvent={() => openCreateEventModal(new Date())}
        onRefresh={() => void fetchAll({ reloadCalendars: true, userInitiated: true })}
        syncing={syncing}
        refreshFailed={refreshFailed}
      />
      <div className="m365-calendar-body">
        <CalendarSelector
          calendars={calendars}
          enabledCalendarIds={enabledIds}
          onToggle={(id) => void handleToggleCalendar(id)}
        />
        <div className="m365-calendar-main">
          {view === 'month' && (
            <MonthView
              currentDate={currentDate}
              events={events}
              calendars={calendars}
              onDayClick={handleDayClick}
              onEventClick={handleEventClick}
            />
          )}
          {view === 'week' && (
            <WeekView
              currentDate={currentDate}
              events={events}
              calendars={calendars}
              onDayClick={handleDayClick}
              onEventClick={handleEventClick}
            />
          )}
          {view === 'day' && (
            <DayView
              currentDate={currentDate}
              events={events}
              calendars={calendars}
              onTimeClick={openCreateEventModal}
              onEventClick={handleEventClick}
            />
          )}
        </div>
      </div>
    </div>
  );
};
```

Note: `getDateRange` for week view now also calls `sunday.setHours(0, 0, 0, 0)` to normalize the start to local midnight. This ensures week-view cache keys are stable regardless of what time the component first mounted.

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Confirm no TypeScript errors**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Run lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```
git add src/components/CalendarApp.tsx src/components/Toolbar.tsx
git commit -m "feat: stale-while-revalidate UX with background failure indicator"
```
