# High-Impact Refactors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate three categories of duplication — retry logic shared between two services, a date-input parser duplicated across two modals, and a time-formatting call repeated across three components.

**Architecture:** Each piece of shared logic is extracted to `src/lib/` where the existing `datetime.ts` and `semaphore.ts` already live. `fetchWithRetry` becomes a standalone exported async function. `parseDateInput` and `formatTime` are added as named exports to `datetime.ts`. All call-sites are updated to import from the lib; private copies are deleted.

**Tech Stack:** TypeScript, React, Vitest

---

## Files

| Action | Path | Change |
|--------|------|--------|
| Create | `src/lib/fetchWithRetry.ts` | Extracted retry logic |
| Modify | `src/services/CalendarService.ts` | Delete private `fetchWithRetry`, import from lib |
| Modify | `src/services/WeatherService.ts` | Delete private `fetchWithRetry`, import from lib |
| Modify | `src/lib/datetime.ts` | Add `parseDateInput` and `formatTime` exports |
| Modify | `src/components/CreateEventModal.tsx` | Replace inline `parseStr` with `parseDateInput` |
| Modify | `src/components/EventDetailModal.tsx` | Replace inline `parseStr` with `parseDateInput` |
| Modify | `src/components/EventCard.tsx` | Replace inline `toLocaleTimeString` call with `formatTime` |
| Modify | `src/components/EventHoverPopover.tsx` | Replace inline `toLocaleTimeString` calls with `formatTime` |
| Modify | `src/components/TimelineColumn.tsx` | Replace inline `toLocaleTimeString` calls with `formatTime` |
| Create | `tests/lib/fetchWithRetry.test.ts` | Unit tests for the extracted function |
| Modify | `tests/lib/datetime.test.ts` | Tests for `parseDateInput` and `formatTime` |
| Modify | `tests/services/CalendarService.test.ts:225` | Update error message expectation |

---

## Task 1: Extract `fetchWithRetry` to `src/lib/fetchWithRetry.ts`

**Files:**
- Create: `src/lib/fetchWithRetry.ts`
- Create: `tests/lib/fetchWithRetry.test.ts`
- Modify: `src/services/CalendarService.ts`
- Modify: `src/services/WeatherService.ts`
- Modify: `tests/services/CalendarService.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/fetchWithRetry.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWithRetry } from '../../src/lib/fetchWithRetry';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('fetchWithRetry', () => {
  it('returns the response immediately when status is not 429', async () => {
    const mockResponse = { ok: true, status: 200 } as Response;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));
    const result = await fetchWithRetry('https://example.com', {});
    expect(result).toBe(mockResponse);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 and returns the successful response on the second attempt', async () => {
    vi.useFakeTimers();
    const failResponse = {
      ok: false,
      status: 429,
      headers: { get: (h: string) => (h === 'Retry-After' ? '1' : null) },
    } as unknown as Response;
    const okResponse = { ok: true, status: 200 } as Response;
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(failResponse)
      .mockResolvedValueOnce(okResponse);
    vi.stubGlobal('fetch', mockFetch);

    const promise = fetchWithRetry('https://example.com', {});
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(okResponse);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting all 3 attempts', async () => {
    vi.useFakeTimers();
    const failResponse = {
      ok: false,
      status: 429,
      headers: { get: () => '1' },
    } as unknown as Response;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(failResponse));

    const promise = fetchWithRetry('https://example.com', {});
    const assertion = expect(promise).rejects.toThrow('Too many requests');
    await vi.runAllTimersAsync();
    await assertion;

    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('uses a 10-second default delay when Retry-After header is absent', async () => {
    vi.useFakeTimers();
    const failResponse = {
      ok: false,
      status: 429,
      headers: { get: () => null },
    } as unknown as Response;
    const okResponse = { ok: true, status: 200 } as Response;
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(failResponse)
      .mockResolvedValueOnce(okResponse);
    vi.stubGlobal('fetch', mockFetch);

    const promise = fetchWithRetry('https://example.com', {});
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe(okResponse);
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
npx vitest run tests/lib/fetchWithRetry.test.ts
```

Expected: FAIL — `fetchWithRetry` not found.

- [ ] **Step 3: Create `src/lib/fetchWithRetry.ts`**

```typescript
const MAX_RETRIES = 3;

export async function fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetch(url, options);
    if (response.status !== 429) return response;
    if (attempt < MAX_RETRIES - 1) {
      const raw = parseInt(response.headers.get('Retry-After') ?? '', 10);
      const retryAfter = Number.isFinite(raw) && raw > 0 ? raw : 10;
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    }
  }
  throw new Error('Too many requests');
}
```

- [ ] **Step 4: Run the new tests to verify they pass**

```bash
npx vitest run tests/lib/fetchWithRetry.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Update `CalendarService.ts`**

Replace the import block at the top:

```typescript
import { fetchWithRetry } from '../lib/fetchWithRetry';
```

Delete the entire private `fetchWithRetry` method (lines 157–169):

```typescript
// DELETE THIS:
private async fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetch(url, options);
    if (response.status !== 429) return response;
    if (attempt < MAX_RETRIES - 1) {
      const raw = parseInt(response.headers.get('Retry-After') ?? '', 10);
      const retryAfter = Number.isFinite(raw) && raw > 0 ? raw : 10;
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    }
  }
  throw new Error('Failed to fetch events: Too Many Requests');
}
```

Change the call site in `getEventsForCalendar` from `this.fetchWithRetry(...)` to `fetchWithRetry(...)`.

- [ ] **Step 6: Update `WeatherService.ts`**

Replace the import block at the top:

```typescript
import { fetchWithRetry } from '../lib/fetchWithRetry';
```

Delete the entire private `fetchWithRetry` method (lines 144–156):

```typescript
// DELETE THIS:
private async fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetch(url, options);
    if (response.status !== 429) return response;
    if (attempt < MAX_RETRIES - 1) {
      const raw = parseInt(response.headers.get('Retry-After') ?? '', 10);
      const retryAfter = Number.isFinite(raw) && raw > 0 ? raw : 10;
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    }
  }
  throw new Error('Weather API: Too Many Requests');
}
```

Change both call sites (`getCoordinates` and `fetchForecast`) from `this.fetchWithRetry(...)` to `fetchWithRetry(...)`.

- [ ] **Step 7: Update the error message expectation in `tests/services/CalendarService.test.ts`**

Line 225 currently reads:
```typescript
const assertion = expect(promise).rejects.toThrow('Failed to fetch events: Too Many Requests');
```

Change to:
```typescript
const assertion = expect(promise).rejects.toThrow('Too many requests');
```

- [ ] **Step 8: Run all tests**

```bash
npm test
```

Expected: all 266 (+ 4 new) tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/fetchWithRetry.ts tests/lib/fetchWithRetry.test.ts \
        src/services/CalendarService.ts src/services/WeatherService.ts \
        tests/services/CalendarService.test.ts
git commit -m "refactor: extract fetchWithRetry to src/lib"
```

---

## Task 2: Extract `parseDateInput` to `src/lib/datetime.ts`

**Files:**
- Modify: `src/lib/datetime.ts`
- Modify: `tests/lib/datetime.test.ts`
- Modify: `src/components/CreateEventModal.tsx`
- Modify: `src/components/EventDetailModal.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/datetime.test.ts`:

```typescript
describe('parseDateInput', () => {
  it('parses a date-only string as local midnight', () => {
    const d = parseDateInput('2026-04-08');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3); // April
    expect(d.getDate()).toBe(8);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it('parses a datetime-local string preserving the time', () => {
    const d = parseDateInput('2026-04-08T14:30');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3);
    expect(d.getDate()).toBe(8);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
  });
});
```

Also update the import line at the top of `tests/lib/datetime.test.ts`:

```typescript
import { toDateOnly, toDateTimeLocal, toLocalISOString, parseDateInput } from '../../src/lib/datetime';
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
npx vitest run tests/lib/datetime.test.ts
```

Expected: FAIL — `parseDateInput` is not exported from `datetime`.

- [ ] **Step 3: Add `parseDateInput` to `src/lib/datetime.ts`**

Append after the existing exports:

```typescript
/**
 * Parse a string from an HTML date or datetime-local input as a local-time Date.
 * Date-only strings ("YYYY-MM-DD") are treated as local midnight — appending
 * T00:00 prevents the spec-mandated UTC-parse that would shift the date backwards
 * in negative-offset timezones.
 */
export function parseDateInput(s: string): Date {
  return new Date(s.length === 10 ? `${s}T00:00` : s);
}
```

- [ ] **Step 4: Run the new tests to verify they pass**

```bash
npx vitest run tests/lib/datetime.test.ts
```

Expected: PASS (all datetime tests including the 2 new ones).

- [ ] **Step 5: Update `CreateEventModal.tsx`**

Add `parseDateInput` to the import from `../lib/datetime`:

```typescript
import { toDateOnly, toDateTimeLocal, parseDateInput } from '../lib/datetime';
```

In `handleAllDayChange`, replace the inline `parseStr` definition and its two usages:

```typescript
// DELETE this line:
const parseStr = (s: string): Date => new Date(s.length === 10 ? `${s}T00:00` : s);

// Replace:
const s = parseStr(startStr);
const e = parseStr(endStr);
// With:
const s = parseDateInput(startStr);
const e = parseDateInput(endStr);
```

- [ ] **Step 6: Update `EventDetailModal.tsx`**

Add `parseDateInput` to the import from `../lib/datetime`:

```typescript
import { toDateOnly, toDateTimeLocal, parseDateInput } from '../lib/datetime';
```

In `handleAllDayChange`, replace the inline `parseStr` definition and its two usages:

```typescript
// DELETE this line:
const parseStr = (s: string): Date => new Date(s.length === 10 ? `${s}T00:00` : s);

// Replace:
const s = parseStr(startStr);
const e = parseStr(endStr);
// With:
const s = parseDateInput(startStr);
const e = parseDateInput(endStr);
```

- [ ] **Step 7: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/datetime.ts tests/lib/datetime.test.ts \
        src/components/CreateEventModal.tsx src/components/EventDetailModal.tsx
git commit -m "refactor: extract parseDateInput to src/lib/datetime"
```

---

## Task 3: Add `formatTime` helper to `src/lib/datetime.ts`

**Files:**
- Modify: `src/lib/datetime.ts`
- Modify: `tests/lib/datetime.test.ts`
- Modify: `src/components/EventCard.tsx`
- Modify: `src/components/EventHoverPopover.tsx`
- Modify: `src/components/TimelineColumn.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/datetime.test.ts`:

```typescript
describe('formatTime', () => {
  it('returns a string containing the minutes', () => {
    expect(formatTime(new Date(2026, 3, 8, 14, 30))).toContain('30');
  });

  it('returns a string containing the hours in some form', () => {
    // toLocaleTimeString output is locale-dependent (12h vs 24h), but the
    // minute value 45 must appear regardless of locale.
    expect(formatTime(new Date(2026, 3, 8, 9, 45))).toContain('45');
  });
});
```

Also update the import line at the top of `tests/lib/datetime.test.ts`:

```typescript
import { toDateOnly, toDateTimeLocal, toLocalISOString, parseDateInput, formatTime } from '../../src/lib/datetime';
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
npx vitest run tests/lib/datetime.test.ts
```

Expected: FAIL — `formatTime` is not exported from `datetime`.

- [ ] **Step 3: Add `formatTime` to `src/lib/datetime.ts`**

Append after `parseDateInput`:

```typescript
/** Format a Date as a locale-appropriate short time string, e.g. "2:30 PM" or "14:30". */
export function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
```

- [ ] **Step 4: Run the new tests to verify they pass**

```bash
npx vitest run tests/lib/datetime.test.ts
```

Expected: PASS.

- [ ] **Step 5: Update `EventCard.tsx`**

Add `formatTime` to the import from `../lib/datetime`:

```typescript
import { formatTime } from '../lib/datetime';
```

Replace the inline call on line 14:

```typescript
// Replace:
: startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
// With:
: formatTime(startTime);
```

- [ ] **Step 6: Update `EventHoverPopover.tsx`**

Add `formatTime` to the import from `../lib/datetime`:

```typescript
import { formatTime } from '../lib/datetime';
```

Replace both inline calls on line 27:

```typescript
// Replace:
: `${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
// With:
: `${formatTime(startTime)} – ${formatTime(endTime)}`;
```

- [ ] **Step 7: Update `TimelineColumn.tsx`**

Add `formatTime` to the import from `../lib/datetime`:

```typescript
import { formatTime } from '../lib/datetime';
```

Replace both inline calls (lines 154–155):

```typescript
// Replace:
const startTimeStr = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const endTimeStr = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
// With:
const startTimeStr = formatTime(start);
const endTimeStr = formatTime(end);
```

- [ ] **Step 8: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/datetime.ts tests/lib/datetime.test.ts \
        src/components/EventCard.tsx src/components/EventHoverPopover.tsx \
        src/components/TimelineColumn.tsx
git commit -m "refactor: extract formatTime to src/lib/datetime"
```
