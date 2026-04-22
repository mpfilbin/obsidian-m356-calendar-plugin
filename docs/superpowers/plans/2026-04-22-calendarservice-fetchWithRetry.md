# CalendarService fetchWithRetry Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four bare `fetch` calls in `CalendarService` (`getCalendars`, `createEvent`, `updateEvent`, `deleteEvent`) with `fetchWithRetry` so all Graph API calls get consistent 429 retry behaviour.

**Architecture:** `fetchWithRetry` is already imported at line 6 of `CalendarService.ts` and used by `getEventsForCalendar`. The other four methods call bare `fetch` directly. The fix is four one-word substitutions (`fetch` → `fetchWithRetry`). No new files, no interface changes. The existing tests stub the global `fetch` via `vi.stubGlobal`, which `fetchWithRetry` calls internally, so all existing tests continue to pass without modification.

**Tech Stack:** TypeScript, Vitest

---

## Files

| Action | Path | Change |
|--------|------|--------|
| Modify | `src/services/CalendarService.ts` | Replace `fetch(` with `fetchWithRetry(` at lines 20, 54, 77, 91 |
| Modify | `tests/services/CalendarService.test.ts` | Add one 429 retry test per method (4 tests) |

---

## Task 1: Extend `fetchWithRetry` to all CalendarService methods

**Files:**
- Modify: `src/services/CalendarService.ts`
- Modify: `tests/services/CalendarService.test.ts`

- [ ] **Step 1: Write the failing tests**

Append these four tests to `tests/services/CalendarService.test.ts`, inside the existing `describe('CalendarService', ...)` block, after the existing `// --- createEvent / updateEvent / deleteEvent ---` section and before the `// --- moveEvent ---` section:

```typescript
  // --- 429 retry for mutations ---

  it('getCalendars retries on 429 and succeeds after Retry-After delay', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: (h: string) => (h === 'Retry-After' ? '1' : null) },
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          value: [{ id: 'cal1', name: 'My Calendar', hexColor: '#0078d4', isDefaultCalendar: true, canEdit: true }],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const promise = service.getCalendars();
    await vi.runAllTimersAsync();
    const calendars = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(calendars).toHaveLength(1);
  });

  it('createEvent retries on 429 and succeeds after Retry-After delay', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: (h: string) => (h === 'Retry-After' ? '1' : null) },
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'evt2',
          subject: 'New Event',
          start: { dateTime: '2026-04-05T10:00:00', timeZone: 'UTC' },
          end: { dateTime: '2026-04-05T11:00:00', timeZone: 'UTC' },
          isAllDay: false,
        }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const promise = service.createEvent('cal1', {
      subject: 'New Event',
      start: new Date('2026-04-05T10:00:00'),
      end: new Date('2026-04-05T11:00:00'),
    });
    await vi.runAllTimersAsync();
    const event = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(event.subject).toBe('New Event');
  });

  it('updateEvent retries on 429 and succeeds after Retry-After delay', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: (h: string) => (h === 'Retry-After' ? '1' : null) },
      })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const promise = service.updateEvent('evt1', { subject: 'Updated' });
    await vi.runAllTimersAsync();
    await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('deleteEvent retries on 429 and succeeds after Retry-After delay', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: (h: string) => (h === 'Retry-After' ? '1' : null) },
      })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const promise = service.deleteEvent('evt1');
    await vi.runAllTimersAsync();
    await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
npx vitest run tests/services/CalendarService.test.ts
```

Expected: the 4 new tests FAIL because the methods use bare `fetch` which does not retry. All pre-existing tests should still pass.

- [ ] **Step 3: Replace bare `fetch` with `fetchWithRetry` in `src/services/CalendarService.ts`**

`fetchWithRetry` is already imported at line 6. Make these four substitutions:

**`getCalendars` (line 20):**
```typescript
// Change:
    const response = await fetch(`${GRAPH_BASE}/me/calendars`, {
// To:
    const response = await fetchWithRetry(`${GRAPH_BASE}/me/calendars`, {
```

**`createEvent` (line 54):**
```typescript
// Change:
    const response = await fetch(`${GRAPH_BASE}/me/calendars/${calendarId}/events`, {
// To:
    const response = await fetchWithRetry(`${GRAPH_BASE}/me/calendars/${calendarId}/events`, {
```

**`updateEvent` (line 77):**
```typescript
// Change:
    const response = await fetch(`${GRAPH_BASE}/me/events/${eventId}`, {
// To:
    const response = await fetchWithRetry(`${GRAPH_BASE}/me/events/${eventId}`, {
```

**`deleteEvent` (line 91):**
```typescript
// Change:
    const response = await fetch(`${GRAPH_BASE}/me/events/${eventId}`, {
// To:
    const response = await fetchWithRetry(`${GRAPH_BASE}/me/events/${eventId}`, {
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: all 297 tests pass (293 existing + 4 new).

- [ ] **Step 5: Commit**

Use `mcp__git__*` MCP tools (required by this repo's CLAUDE.md):

```
Stage: src/services/CalendarService.ts
       tests/services/CalendarService.test.ts
Message: fix: use fetchWithRetry consistently across all CalendarService methods
```
