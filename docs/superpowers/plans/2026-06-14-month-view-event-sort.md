# Month View Event Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sort events in each month-view day cell so timed events appear in ascending start-time order and all-day events are pinned to the top.

**Architecture:** Chain a `.sort()` onto the `dayEvents` filter in `MonthView.tsx`. No upstream changes needed — the overflow popup already slices from `dayEvents`, so it inherits the sorted order automatically.

**Tech Stack:** React, TypeScript, Vitest + Testing Library

---

### Task 1: Add failing tests for event sort order

**Files:**
- Modify: `tests/components/MonthView.test.tsx`

- [ ] **Step 1: Add a new `describe` block for event sort at the bottom of `tests/components/MonthView.test.tsx`**

Append this block after the last closing `});` in the file:

```typescript
describe('MonthView — event sort order', () => {
  const cal: M365Calendar = {
    id: 'cal1',
    name: 'Work',
    color: '#0078d4',
    isDefaultCalendar: true,
    canEdit: true,
  };

  it('renders timed events in ascending start-time order regardless of input order', () => {
    const events: M365Event[] = [
      {
        id: 'e3',
        subject: '3 PM Meeting',
        start: { dateTime: '2026-04-04T15:00:00', timeZone: 'UTC' },
        end: { dateTime: '2026-04-04T16:00:00', timeZone: 'UTC' },
        calendarId: 'cal1',
        isAllDay: false,
      },
      {
        id: 'e1',
        subject: '9 AM Meeting',
        start: { dateTime: '2026-04-04T09:00:00', timeZone: 'UTC' },
        end: { dateTime: '2026-04-04T10:00:00', timeZone: 'UTC' },
        calendarId: 'cal1',
        isAllDay: false,
      },
      {
        id: 'e2',
        subject: '12 PM Meeting',
        start: { dateTime: '2026-04-04T12:00:00', timeZone: 'UTC' },
        end: { dateTime: '2026-04-04T13:00:00', timeZone: 'UTC' },
        calendarId: 'cal1',
        isAllDay: false,
      },
    ];
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={events}
        calendars={[cal]}
        onDayClick={vi.fn()}
        maxEventsPerDay={3}
      />,
    );
    const buttons = Array.from(
      document.querySelectorAll('.m365-event-click-btn[aria-label^="Edit event:"]'),
    );
    const subjects = buttons.map((b) => b.getAttribute('aria-label')?.replace('Edit event: ', ''));
    expect(subjects).toEqual(['9 AM Meeting', '12 PM Meeting', '3 PM Meeting']);
  });

  it('renders all-day events before timed events', () => {
    const events: M365Event[] = [
      {
        id: 'timed',
        subject: '9 AM Meeting',
        start: { dateTime: '2026-04-04T09:00:00', timeZone: 'UTC' },
        end: { dateTime: '2026-04-04T10:00:00', timeZone: 'UTC' },
        calendarId: 'cal1',
        isAllDay: false,
      },
      {
        id: 'allday',
        subject: 'All Day Event',
        start: { dateTime: '2026-04-04', timeZone: 'UTC' },
        end: { dateTime: '2026-04-05', timeZone: 'UTC' },
        calendarId: 'cal1',
        isAllDay: true,
      },
    ];
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={events}
        calendars={[cal]}
        onDayClick={vi.fn()}
        maxEventsPerDay={3}
      />,
    );
    const buttons = Array.from(
      document.querySelectorAll('.m365-event-click-btn[aria-label^="Edit event:"]'),
    );
    const subjects = buttons.map((b) => b.getAttribute('aria-label')?.replace('Edit event: ', ''));
    expect(subjects).toEqual(['All Day Event', '9 AM Meeting']);
  });
});
```

- [ ] **Step 2: Run the new tests to confirm they fail**

```bash
npx vitest run tests/components/MonthView.test.tsx -t "event sort order"
```

Expected output: both tests FAIL (events render in input order, not sorted).

---

### Task 2: Implement the sort in MonthView

**Files:**
- Modify: `src/components/MonthView.tsx:69-71`

- [ ] **Step 3: Replace the `dayEvents` filter with a filter + sort**

Find this code (around line 69):
```typescript
          const dayEvents = events.filter(
            (e) => e.start.dateTime.slice(0, 10) === cellDateStr,
          );
```

Replace it with:
```typescript
          const dayEvents = events
            .filter((e) => e.start.dateTime.slice(0, 10) === cellDateStr)
            .sort((a, b) => {
              if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
              return a.start.dateTime.localeCompare(b.start.dateTime);
            });
```

- [ ] **Step 4: Run the new tests to confirm they pass**

```bash
npx vitest run tests/components/MonthView.test.tsx -t "event sort order"
```

Expected output: both tests PASS.

- [ ] **Step 5: Run the full MonthView test suite to confirm no regressions**

```bash
npx vitest run tests/components/MonthView.test.tsx
```

Expected output: all tests PASS.

- [ ] **Step 6: Run the full test suite**

```bash
npm test
```

Expected output: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add tests/components/MonthView.test.tsx src/components/MonthView.tsx
git commit -m "feat: sort month view day cell events — all-day first, then ascending by start time"
```
