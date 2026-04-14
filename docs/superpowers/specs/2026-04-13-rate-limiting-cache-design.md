# Rate Limiting & Caching Improvements Design

**Date:** 2026-04-13
**Branch:** fix_rate_limiting

## Problem

When 6+ calendars are selected, switching views triggers `Promise.all` across all calendars simultaneously, causing Microsoft Graph API to return 429 Too Many Requests. The current cache uses exact date-range keys, so month view and week view always produce cache misses even when the week's events are already contained in the month's fetched data.

## Goals

- Eliminate 429 errors caused by concurrent burst requests
- Avoid redundant API calls when switching between views that overlap the same data
- Show stale events while a background refresh is in progress
- Gracefully handle 429s that still occur (e.g. from external throttling)

## Design

### 1. Interval-Coverage Cache

Replace the exact-key cache (`calendarId:startISO:endISO`) with a per-calendar interval-coverage store.

**Data structure (`CacheStore`):**
```typescript
interface CalendarCacheEntry {
  events: M365Event[];
  intervals: Array<{ start: string; end: string; fetchedAt: number }>;
}

type CacheStore = Record<string, CalendarCacheEntry>;
```

**Read (`getEventsForRange(calendarId, start, end)`):**
1. Look up the calendar entry.
2. Check if any stored interval covers `[start, end]` and has `fetchedAt` within the 24h TTL.
3. If covered: filter `entry.events` to those whose `start.dateTime` falls within the range. Return the filtered list.
4. If not covered: return `null`. The caller fetches from Graph.

**Write (`addEvents(calendarId, start, end, events)`):**
1. Merge incoming events into `entry.events`, deduplicating by event ID.
2. Append `{ start, end, fetchedAt: Date.now() }` to `entry.intervals`.
3. Persist via `saveData`.

**Clear (`clearAll`):**
Resets the entire store to `{}`. Called on create, update, and delete — same as today.

**Init / purge:**
On `init()`, remove any intervals older than 24h from each calendar entry. After removing stale intervals, remove events from the entry whose `start.dateTime` is not covered by any remaining valid interval. Calendar entries with no remaining valid intervals are deleted entirely.

**Result:** Fetching April in month view covers the full month interval. Switching to week view (Apr 13–20) hits the coverage check, finds the superset, and returns filtered events with no API call.

### 2. Request Handling

**Concurrency limiter:**

`CalendarService` holds a `Semaphore` instance capped at 2 concurrent in-flight Graph requests. Each `getEventsForCalendar` call acquires a slot before fetching and releases it in a `finally` block. With 6 calendars selected, requests proceed in pairs rather than as a burst of 6.

```typescript
class Semaphore {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  acquire(): Promise<void> {
    if (this.running < this.limit) {
      this.running++;
      return Promise.resolve();
    }
    return new Promise(resolve => this.queue.push(resolve));
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) { this.running++; next(); }
  }
}
```

**429 retry with `Retry-After` backoff:**

A private `fetchWithRetry` helper in `CalendarService` wraps individual `fetch` calls for event requests. On a 429 response, it reads the `Retry-After` header (seconds), waits that duration, and retries. Max 3 attempts. On exhaustion it throws, which propagates to `fetchAll`'s error handling.

Only `getEventsForCalendar` uses `fetchWithRetry`. Single-request calls (get calendars, create, update, delete) do not need it.

### 3. UX — Stale-While-Revalidate

**Background failure indicator:**

`CalendarApp` gains a `refreshFailed` boolean state alongside the existing `error` string state:

- `error` — set only for user-initiated failures. Shows the existing red error banner. Implies data may be missing.
- `refreshFailed` — set for background (non-user-initiated) failures. Shows a subtle warning indicator on the toolbar refresh button. Stale events remain visible. Cleared on the next successful fetch or manual refresh.

`setError` is no longer called for background failures. The `syncing` spinner remains visible for the full duration of retries (including `Retry-After` waits), so the user knows a refresh is pending throughout.

**No other UX changes.** The existing spinner, toolbar refresh button, and error banner are reused as-is.

## Files Affected

| File | Change |
|------|--------|
| `src/services/CacheService.ts` | Replace exact-key store with interval-coverage store |
| `src/services/CalendarService.ts` | Add `Semaphore`, add `fetchWithRetry`, update `getEventsForCalendar` to use both |
| `src/components/CalendarApp.tsx` | Add `refreshFailed` state; route background failures away from `setError` |
| `src/components/Toolbar.tsx` | Add warning indicator when `refreshFailed` is true |
| `src/types.ts` | Update `CacheStore` type to match new structure |
| `tests/services/CacheService.test.ts` | Update/add tests for interval coverage logic |
| `tests/services/CalendarService.test.ts` | Add tests for semaphore throttling and 429 retry |

## Out of Scope

- Surgical cache updates on create/update/delete (complexity not warranted; mutations are infrequent)
- SQLite or any external database dependency
- Changes to the 24h cache TTL
