# Event Detail / Edit Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an edit modal that opens when the user clicks a calendar event, pre-populated with the event's fields, allowing them to save changes back to Microsoft Graph or cancel.

**Architecture:** Follow the existing `CreateEventModal` pattern — an Obsidian `Modal` subclass mounts a React form component via `createRoot`. The form receives an async `onSave(patch)` callback so save errors surface inline. A new `updateEvent` method on `CalendarService` sends a `PATCH` request to `/v1.0/me/events/{id}`.

**Tech Stack:** TypeScript, React 18, Obsidian Plugin API, Microsoft Graph API, Vitest + @testing-library/react

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/types/index.ts` | Add `location` to `M365Event`; add `EventPatch` interface |
| Modify | `src/services/CalendarService.ts` | Fetch `location`, add `updateEvent()` |
| Modify | `src/components/EventCard.tsx` | Add `onClick` prop |
| Modify | `src/components/MonthView.tsx` | Add `onEventClick` prop, wire to EventCard |
| Modify | `src/components/WeekView.tsx` | Add `onEventClick` prop, wire to EventCard |
| Create | `src/components/EventDetailModal.tsx` | `EventDetailForm` React component + `EventDetailModal` Obsidian Modal subclass |
| Modify | `src/components/CalendarApp.tsx` | Add `handleEventClick`, pass `onEventClick` to views |
| Modify | `tests/services/CalendarService.test.ts` | Tests for `updateEvent` |
| Modify | `tests/components/EventCard.test.tsx` | Test `onClick` prop |
| Modify | `tests/components/MonthView.test.tsx` | Tests for `onEventClick` / stopPropagation |
| Modify | `tests/components/WeekView.test.tsx` | Tests for `onEventClick` / stopPropagation |
| Create | `tests/components/EventDetailModal.test.tsx` | Tests for `EventDetailForm` |

---

## Task 1: Extend types — `M365Event.location` and `EventPatch`

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add `location` to `M365Event` and add `EventPatch` interface**

  Replace the `M365Event` interface and add `EventPatch` after `NewEventInput` in `src/types/index.ts`:

  ```typescript
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

  export interface EventPatch {
    subject?: string;
    location?: string;
    isAllDay?: boolean;
    start?: { dateTime: string; timeZone: string };
    end?: { dateTime: string; timeZone: string };
    bodyContent?: string;
  }
  ```

  `EventPatch` goes between `NewEventInput` and `CachedEvents`.

- [ ] **Step 2: Run typecheck — should pass (location is optional, all existing code still compiles)**

  ```bash
  npm run typecheck
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src/types/index.ts
  git commit -m "feat: add location to M365Event and define EventPatch interface"
  ```

---

## Task 2: CalendarService — fetch location and add `updateEvent`

**Files:**
- Modify: `src/services/CalendarService.ts`
- Modify: `tests/services/CalendarService.test.ts`

- [ ] **Step 1: Write failing tests for `updateEvent`**

  Add these three tests at the bottom of the `describe('CalendarService', ...)` block in `tests/services/CalendarService.test.ts`:

  ```typescript
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
  ```

- [ ] **Step 2: Run tests — expect failures**

  ```bash
  npx vitest run tests/services/CalendarService.test.ts
  ```

  Expected: 3 new tests fail with "service.updateEvent is not a function".

- [ ] **Step 3: Update `CalendarService` — add `location` to `$select`, update `mapEvent`, add `updateEvent`**

  In `src/services/CalendarService.ts`:

  1. Add `EventPatch` to the import from `'../types'`:
     ```typescript
     import { M365Calendar, M365Event, NewEventInput, EventPatch } from '../types';
     ```

  2. Change line 71 (the `$select` param) to include `location`:
     ```typescript
     $select: 'id,subject,start,end,isAllDay,bodyPreview,webLink,location',
     ```

  3. Replace the `mapEvent` private method (lines 86–97) with:
     ```typescript
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
     ```

  4. Add this new public method after `createEvent` (before `getEventsForCalendar`):
     ```typescript
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
     }
     ```

- [ ] **Step 4: Run tests — all should pass**

  ```bash
  npx vitest run tests/services/CalendarService.test.ts
  ```

  Expected: all tests pass.

- [ ] **Step 5: Run typecheck**

  ```bash
  npm run typecheck
  ```

  Expected: no errors.

- [ ] **Step 6: Commit**

  ```bash
  git add src/services/CalendarService.ts tests/services/CalendarService.test.ts
  git commit -m "feat: fetch event location from Graph and add updateEvent method"
  ```

---

## Task 3: EventCard — add `onClick` prop

**Files:**
- Modify: `src/components/EventCard.tsx`
- Modify: `tests/components/EventCard.test.tsx`

- [ ] **Step 1: Write failing test for `onClick`**

  Add this test to the `describe('EventCard', ...)` block in `tests/components/EventCard.test.tsx`:

  ```typescript
  it('calls onClick when the card is clicked', async () => {
    const onClick = vi.fn();
    render(<EventCard event={timedEvent} calendar={calendar} onClick={onClick} />);
    await userEvent.click(document.querySelector('.m365-calendar-event-card')!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  ```

  Also add `vi` and `userEvent` imports at the top of the file if not already present:
  ```typescript
  import { describe, it, expect, vi } from 'vitest';
  import userEvent from '@testing-library/user-event';
  ```

- [ ] **Step 2: Run test — expect failure**

  ```bash
  npx vitest run tests/components/EventCard.test.tsx
  ```

  Expected: new test fails ("onClick is not a function" or prop ignored).

- [ ] **Step 3: Update `EventCard` to accept and wire `onClick`**

  Replace `src/components/EventCard.tsx` with:

  ```typescript
  import React from 'react';
  import { M365Event, M365Calendar } from '../types';

  interface EventCardProps {
    event: M365Event;
    calendar: M365Calendar;
    onClick?: () => void;
  }

  export const EventCard: React.FC<EventCardProps> = ({ event, calendar, onClick }) => {
    const startTime = new Date(event.start.dateTime);
    const timeLabel = event.isAllDay
      ? 'All day'
      : startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
      <div
        className="m365-calendar-event-card"
        style={{ borderLeftColor: calendar.color }}
        title={event.subject}
        onClick={onClick}
      >
        <span className="m365-calendar-event-time">{timeLabel}</span>
        <span className="m365-calendar-event-title">{event.subject}</span>
      </div>
    );
  };
  ```

- [ ] **Step 4: Run tests — all should pass**

  ```bash
  npx vitest run tests/components/EventCard.test.tsx
  ```

  Expected: all tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/EventCard.tsx tests/components/EventCard.test.tsx
  git commit -m "feat: add onClick prop to EventCard"
  ```

---

## Task 4: MonthView — add `onEventClick` prop

**Files:**
- Modify: `src/components/MonthView.tsx`
- Modify: `tests/components/MonthView.test.tsx`

- [ ] **Step 1: Write failing tests**

  Add these two tests to `tests/components/MonthView.test.tsx`:

  ```typescript
  it('calls onEventClick with the event when an event card is clicked', async () => {
    const onEventClick = vi.fn();
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[eventOnApril4]}
        calendars={[calendar]}
        onDayClick={vi.fn()}
        onEventClick={onEventClick}
      />,
    );
    await userEvent.click(screen.getByText('Team Meeting'));
    expect(onEventClick).toHaveBeenCalledWith(eventOnApril4);
  });

  it('does not call onDayClick when an event card is clicked', async () => {
    const onDayClick = vi.fn();
    const onEventClick = vi.fn();
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[eventOnApril4]}
        calendars={[calendar]}
        onDayClick={onDayClick}
        onEventClick={onEventClick}
      />,
    );
    await userEvent.click(screen.getByText('Team Meeting'));
    expect(onDayClick).not.toHaveBeenCalled();
  });
  ```

- [ ] **Step 2: Run tests — expect failures**

  ```bash
  npx vitest run tests/components/MonthView.test.tsx
  ```

  Expected: 2 new tests fail.

- [ ] **Step 3: Update `MonthView`**

  In `src/components/MonthView.tsx`, make these changes:

  1. Update the props interface:
     ```typescript
     interface MonthViewProps {
       currentDate: Date;
       events: M365Event[];
       calendars: M365Calendar[];
       onDayClick: (date: Date) => void;
       onEventClick?: (event: M365Event) => void;
     }
     ```

  2. Update the component signature to destructure `onEventClick`:
     ```typescript
     export const MonthView: React.FC<MonthViewProps> = ({
       currentDate,
       events,
       calendars,
       onDayClick,
       onEventClick,
     }) => {
     ```

  3. Replace the `<EventCard>` render (line ~79) with:
     ```typescript
     return (
       <EventCard
         key={event.id}
         event={event}
         calendar={cal}
         onClick={onEventClick ? (e) => { (e as unknown as React.MouseEvent).stopPropagation?.(); onEventClick(event); } : undefined}
       />
     );
     ```

     Wait — `EventCard`'s `onClick` is `() => void` (no event arg). `stopPropagation` must be called on the DOM event, not from within the EventCard's `onClick` callback. Use an inline wrapper on the wrapping element instead.

     The cleanest approach: wrap each `EventCard` in a `<div>` that stops propagation:
     ```typescript
     return (
       <div
         key={event.id}
         onClick={(e) => {
           e.stopPropagation();
           onEventClick?.(event);
         }}
       >
         <EventCard event={event} calendar={cal} />
       </div>
     );
     ```

     Replace the existing:
     ```typescript
     return <EventCard key={event.id} event={event} calendar={cal} />;
     ```
     with the above `<div>` wrapper.

- [ ] **Step 4: Run tests — all should pass**

  ```bash
  npx vitest run tests/components/MonthView.test.tsx
  ```

  Expected: all tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/MonthView.tsx tests/components/MonthView.test.tsx
  git commit -m "feat: add onEventClick prop to MonthView"
  ```

---

## Task 5: WeekView — add `onEventClick` prop

**Files:**
- Modify: `src/components/WeekView.tsx`
- Modify: `tests/components/WeekView.test.tsx`

- [ ] **Step 1: Write failing tests**

  First, read the existing `tests/components/WeekView.test.tsx` to see the fixture event's date, then add:

  ```typescript
  it('calls onEventClick with the event when an event card is clicked', async () => {
    const onEventClick = vi.fn();
    render(
      <WeekView
        currentDate={new Date('2026-04-04')}
        events={[eventOnApril4]}
        calendars={[calendar]}
        onDayClick={vi.fn()}
        onEventClick={onEventClick}
      />,
    );
    await userEvent.click(screen.getByText('Team Meeting'));
    expect(onEventClick).toHaveBeenCalledWith(eventOnApril4);
  });

  it('does not call onDayClick when an event card is clicked', async () => {
    const onDayClick = vi.fn();
    render(
      <WeekView
        currentDate={new Date('2026-04-04')}
        events={[eventOnApril4]}
        calendars={[calendar]}
        onDayClick={onDayClick}
        onEventClick={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByText('Team Meeting'));
    expect(onDayClick).not.toHaveBeenCalled();
  });
  ```

  Check `tests/components/WeekView.test.tsx` for existing fixture names (`eventOnApril4`, `calendar`) — use whatever names are already defined there. If there is no event fixture, define one:
  ```typescript
  const eventOnApril4: M365Event = {
    id: 'evt1',
    subject: 'Team Meeting',
    start: { dateTime: '2026-04-04T09:00:00', timeZone: 'UTC' },
    end: { dateTime: '2026-04-04T10:00:00', timeZone: 'UTC' },
    calendarId: 'cal1',
    isAllDay: false,
  };
  ```

- [ ] **Step 2: Run tests — expect failures**

  ```bash
  npx vitest run tests/components/WeekView.test.tsx
  ```

  Expected: 2 new tests fail.

- [ ] **Step 3: Update `WeekView`**

  Same pattern as MonthView:

  1. Update props interface:
     ```typescript
     interface WeekViewProps {
       currentDate: Date;
       events: M365Event[];
       calendars: M365Calendar[];
       onDayClick: (date: Date) => void;
       onEventClick?: (event: M365Event) => void;
     }
     ```

  2. Destructure `onEventClick` in the component signature.

  3. Replace the `<EventCard>` render (line ~72) with a wrapper div:
     ```typescript
     return (
       <div
         key={event.id}
         onClick={(e) => {
           e.stopPropagation();
           onEventClick?.(event);
         }}
       >
         <EventCard event={event} calendar={cal} />
       </div>
     );
     ```

- [ ] **Step 4: Run tests — all should pass**

  ```bash
  npx vitest run tests/components/WeekView.test.tsx
  ```

  Expected: all tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/WeekView.tsx tests/components/WeekView.test.tsx
  git commit -m "feat: add onEventClick prop to WeekView"
  ```

---

## Task 6: Create `EventDetailModal` and `EventDetailForm`

**Files:**
- Create: `src/components/EventDetailModal.tsx`
- Create: `tests/components/EventDetailModal.test.tsx`

- [ ] **Step 1: Write failing tests**

  Create `tests/components/EventDetailModal.test.tsx`:

  ```typescript
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { render, screen, waitFor } from '@testing-library/react';
  import userEvent from '@testing-library/user-event';
  import { EventDetailForm } from '../../src/components/EventDetailModal';
  import { M365Event, M365Calendar } from '../../src/types';

  const calendar: M365Calendar = {
    id: 'cal1',
    name: 'Work',
    color: '#0078d4',
    isDefaultCalendar: true,
    canEdit: true,
  };

  const event: M365Event = {
    id: 'evt1',
    subject: 'Team Meeting',
    start: { dateTime: '2026-04-04T09:00:00', timeZone: 'America/New_York' },
    end: { dateTime: '2026-04-04T10:00:00', timeZone: 'America/New_York' },
    calendarId: 'cal1',
    isAllDay: false,
    bodyPreview: 'Discuss Q2 plans',
    location: 'Conference Room A',
  };

  describe('EventDetailForm', () => {
    let onSave: ReturnType<typeof vi.fn>;
    let onCancel: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      onSave = vi.fn().mockResolvedValue(undefined);
      onCancel = vi.fn();
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('pre-populates subject field from event', () => {
      render(
        <EventDetailForm event={event} calendar={calendar} onSave={onSave} onCancel={onCancel} />,
      );
      expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Team Meeting');
    });

    it('pre-populates location field from event', () => {
      render(
        <EventDetailForm event={event} calendar={calendar} onSave={onSave} onCancel={onCancel} />,
      );
      expect((screen.getByLabelText('Location') as HTMLInputElement).value).toBe('Conference Room A');
    });

    it('pre-populates description from event bodyPreview', () => {
      render(
        <EventDetailForm event={event} calendar={calendar} onSave={onSave} onCancel={onCancel} />,
      );
      expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe('Discuss Q2 plans');
    });

    it('calls onCancel when Cancel is clicked', async () => {
      render(
        <EventDetailForm event={event} calendar={calendar} onSave={onSave} onCancel={onCancel} />,
      );
      await userEvent.click(screen.getByText('Cancel'));
      expect(onCancel).toHaveBeenCalled();
    });

    it('calls onSave with correct patch when OK is clicked', async () => {
      render(
        <EventDetailForm event={event} calendar={calendar} onSave={onSave} onCancel={onCancel} />,
      );
      const titleInput = screen.getByLabelText('Title');
      await userEvent.clear(titleInput);
      await userEvent.type(titleInput, 'Updated Meeting');
      await userEvent.click(screen.getByText('OK'));
      await waitFor(() => expect(onSave).toHaveBeenCalled());
      const patch = onSave.mock.calls[0][0];
      expect(patch.subject).toBe('Updated Meeting');
    });

    it('shows inline error when onSave rejects', async () => {
      onSave.mockRejectedValue(new Error('Network error'));
      render(
        <EventDetailForm event={event} calendar={calendar} onSave={onSave} onCancel={onCancel} />,
      );
      await userEvent.click(screen.getByText('OK'));
      await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument());
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('shows validation error when subject is empty', async () => {
      render(
        <EventDetailForm event={event} calendar={calendar} onSave={onSave} onCancel={onCancel} />,
      );
      const titleInput = screen.getByLabelText('Title');
      await userEvent.clear(titleInput);
      await userEvent.click(screen.getByText('OK'));
      expect(screen.getByText('Title is required')).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
    });
  });
  ```

- [ ] **Step 2: Run tests — expect failures**

  ```bash
  npx vitest run tests/components/EventDetailModal.test.tsx
  ```

  Expected: all tests fail (module not found).

- [ ] **Step 3: Create `src/components/EventDetailModal.tsx`**

  ```typescript
  import { App, Modal } from 'obsidian';
  import React, { StrictMode, useState } from 'react';
  import { createRoot, Root } from 'react-dom/client';
  import { M365Calendar, M365Event, EventPatch } from '../types';

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  function toDateTimeLocal(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function toDateOnly(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // ── Form ─────────────────────────────────────────────────────────────────────

  interface EventDetailFormProps {
    event: M365Event;
    calendar: M365Calendar;
    onSave: (patch: EventPatch) => Promise<void>;
    onCancel: () => void;
  }

  export const EventDetailForm: React.FC<EventDetailFormProps> = ({
    event,
    calendar,
    onSave,
    onCancel,
  }) => {
    const startDate = new Date(event.start.dateTime);
    const endDate = new Date(event.end.dateTime);

    const [subject, setSubject] = useState(event.subject);
    const [location, setLocation] = useState(event.location ?? '');
    const [isAllDay, setIsAllDay] = useState(event.isAllDay);
    const [startStr, setStartStr] = useState(
      event.isAllDay ? toDateOnly(startDate) : toDateTimeLocal(startDate),
    );
    const [endStr, setEndStr] = useState(
      event.isAllDay ? toDateOnly(endDate) : toDateTimeLocal(endDate),
    );
    const [description, setDescription] = useState(event.bodyPreview ?? '');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    const handleAllDayChange = (checked: boolean) => {
      setIsAllDay(checked);
      const s = new Date(startStr);
      const e = new Date(endStr);
      const safeStart = isNaN(s.getTime()) ? startDate : s;
      const safeEnd = isNaN(e.getTime()) ? endDate : e;
      if (checked) {
        setStartStr(toDateOnly(safeStart));
        setEndStr(toDateOnly(safeEnd));
      } else {
        setStartStr(toDateTimeLocal(safeStart));
        setEndStr(toDateTimeLocal(safeEnd));
      }
    };

    const handleSave = async () => {
      if (!subject.trim()) {
        setError('Title is required');
        return;
      }
      setSaving(true);
      setError('');
      try {
        const patch: EventPatch = {
          subject: subject.trim(),
          location: location.trim() || undefined,
          isAllDay,
          start: { dateTime: new Date(startStr).toISOString(), timeZone: event.start.timeZone },
          end: { dateTime: new Date(endStr).toISOString(), timeZone: event.end.timeZone },
          bodyContent: description.trim() || undefined,
        };
        await onSave(patch);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save event');
      } finally {
        setSaving(false);
      }
    };

    return (
      <div className="m365-create-event-form">
        {error && <div className="m365-form-error">{error}</div>}
        <div className="m365-form-field">
          <label htmlFor="m365-event-subject">Title</label>
          <input
            id="m365-event-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            autoFocus
          />
        </div>
        <div className="m365-form-field">
          <label htmlFor="m365-event-location">Location</label>
          <input
            id="m365-event-location"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Add location"
          />
        </div>
        <div className="m365-form-field">
          <label>
            <input
              type="checkbox"
              checked={isAllDay}
              onChange={(e) => handleAllDayChange(e.target.checked)}
            />
            {' All day'}
          </label>
        </div>
        <div className="m365-form-field">
          <label htmlFor="m365-event-start">Start</label>
          <input
            id="m365-event-start"
            type={isAllDay ? 'date' : 'datetime-local'}
            value={startStr}
            onChange={(e) => setStartStr(e.target.value)}
          />
        </div>
        <div className="m365-form-field">
          <label htmlFor="m365-event-end">End</label>
          <input
            id="m365-event-end"
            type={isAllDay ? 'date' : 'datetime-local'}
            value={endStr}
            onChange={(e) => setEndStr(e.target.value)}
          />
        </div>
        <div className="m365-form-field">
          <label htmlFor="m365-event-description">Description</label>
          <textarea
            id="m365-event-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>
        <div className="m365-form-actions">
          <button onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="mod-cta" onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving…' : 'OK'}
          </button>
        </div>
      </div>
    );
  };

  // ── Modal ─────────────────────────────────────────────────────────────────────

  export class EventDetailModal extends Modal {
    private root: Root | null = null;

    constructor(
      app: App,
      private readonly event: M365Event,
      private readonly calendar: M365Calendar,
      private readonly onSaveCallback: (patch: EventPatch) => Promise<void>,
      private readonly onSaved: () => void,
    ) {
      super(app);
    }

    onOpen(): void {
      this.titleEl.setText('Edit event'); // eslint-disable-line obsidianmd/ui/sentence-case
      this.root = createRoot(this.contentEl);
      this.root.render(
        <StrictMode>
          <EventDetailForm
            event={this.event}
            calendar={this.calendar}
            onSave={async (patch) => {
              await this.onSaveCallback(patch);
              this.close();
              this.onSaved();
            }}
            onCancel={() => this.close()}
          />
        </StrictMode>,
      );
    }

    onClose(): void {
      this.root?.unmount();
    }
  }
  ```

- [ ] **Step 4: Run tests — all should pass**

  ```bash
  npx vitest run tests/components/EventDetailModal.test.tsx
  ```

  Expected: all tests pass.

- [ ] **Step 5: Run full test suite**

  ```bash
  npm test
  ```

  Expected: all tests pass.

- [ ] **Step 6: Run typecheck and lint**

  ```bash
  npm run typecheck && npm run lint
  ```

  Expected: no errors.

- [ ] **Step 7: Commit**

  ```bash
  git add src/components/EventDetailModal.tsx tests/components/EventDetailModal.test.tsx
  git commit -m "feat: add EventDetailForm and EventDetailModal for editing events"
  ```

---

## Task 7: Wire `handleEventClick` in `CalendarApp`

**Files:**
- Modify: `src/components/CalendarApp.tsx`

- [ ] **Step 1: Add `EventDetailModal` import and `handleEventClick` function**

  In `src/components/CalendarApp.tsx`:

  1. Add the import after the existing `CreateEventModal` import:
     ```typescript
     import { EventDetailModal } from './EventDetailModal';
     ```

  2. Add `handleEventClick` after `handleDayClick` (around line 121):
     ```typescript
     const handleEventClick = (event: M365Event) => {
       const calendar = calendars.find((c) => c.id === event.calendarId);
       if (!calendar) return;
       new EventDetailModal(
         app,
         event,
         calendar,
         async (patch) => calendarService.updateEvent(event.id, patch),
         () => void fetchAll({ reloadCalendars: false, notify: false }),
       ).open();
     };
     ```

  3. Pass `onEventClick={handleEventClick}` to both `MonthView` and `WeekView`:
     ```typescript
     <MonthView
       currentDate={currentDate}
       events={events}
       calendars={calendars}
       onDayClick={handleDayClick}
       onEventClick={handleEventClick}
     />
     ```
     ```typescript
     <WeekView
       currentDate={currentDate}
       events={events}
       calendars={calendars}
       onDayClick={handleDayClick}
       onEventClick={handleEventClick}
     />
     ```

- [ ] **Step 2: Run full test suite**

  ```bash
  npm test
  ```

  Expected: all tests pass.

- [ ] **Step 3: Run typecheck and lint**

  ```bash
  npm run typecheck && npm run lint
  ```

  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/CalendarApp.tsx
  git commit -m "feat: wire event click to open EventDetailModal from CalendarApp"
  ```

---

## Verification

1. **Unit tests:** `npm test` — all pass
2. **Build:** `npm run build` — compiles without errors
3. **Manual smoke test:**
   - Load plugin in Obsidian (dev build via `npm run dev`)
   - Click any event card → "Edit event" modal opens, fields pre-populated
   - Edit subject/location/description → click OK → event updates in Microsoft 365, calendar refreshes
   - Click Cancel → modal closes, no changes
   - Edit with empty subject → "Title is required" error shown inline
   - Simulate network failure → inline error shown, modal stays open
